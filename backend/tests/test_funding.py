import copy
import unittest
from datetime import UTC, datetime
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.funding import (
    Rule,
    evaluate_rules,
    field_value,
    load_seed_catalog,
    router,
)
from backend.source_watch import SourceFetchError, public_addresses, validate_url

NOW = datetime(2026, 10, 12, 12, tzinfo=UTC)
SOURCE = "https://www.gov.uk/claim-employment-allowance/eligibility"


def boolean_rule():
    return {
        "id": "sme",
        "label": "SME required",
        "field": "company.is_sme",
        "op": "eq",
        "value_type": "boolean",
        "expected": True,
        "source_url": SOURCE,
        "source_locator": "Who can apply",
    }


class DeterministicConsumerTests(unittest.TestCase):
    def test_same_inputs_and_time_are_identical_and_input_not_mutated(self):
        profile = {"company": {"is_sme": True}}
        rules = [boolean_rule()]
        before = copy.deepcopy((profile, rules))
        first = evaluate_rules(profile, rules, NOW)
        self.assertEqual(first, evaluate_rules(profile, rules, NOW))
        self.assertEqual(before, (profile, rules))
        self.assertEqual(first["eligibility"], "eligible")
        self.assertEqual(first["conditions"][0]["source_url"], SOURCE)
        self.assertEqual(first["conditions"][0]["source_locator"], "Who can apply")

    def test_missing_and_untyped_boolean_never_eligible(self):
        for value in [None, "true", "false", 1, [], {}]:
            with self.subTest(value=value):
                result = evaluate_rules({"company": {"is_sme": value}}, [boolean_rule()], NOW)
                self.assertEqual(result["eligibility"], "information_missing")
                self.assertEqual(result["conditions"][0]["status"], "missing")
        self.assertEqual(
            evaluate_rules({"company": {"is_sme": False}}, [boolean_rule()], NOW)["eligibility"],
            "ineligible",
        )

    def test_unknown_rule_or_wrong_expected_boolean_rejected(self):
        for changes in [{"op": "llm"}, {"expected": "true"}]:
            with self.subTest(changes=changes), self.assertRaises(ValidationError):
                Rule.model_validate(boolean_rule() | changes)

    def test_closed_separate_and_opening_not_eligible(self):
        deadline = datetime(2026, 10, 11, tzinfo=UTC)
        result = evaluate_rules({}, [boolean_rule()], NOW, deadline=deadline)
        self.assertEqual(result["eligibility"], "closed")
        self.assertEqual(result["conditions"][0]["status"], "missing")
        future = evaluate_rules(
            {"company": {"is_sme": True}},
            [boolean_rule()],
            NOW,
            opens_at=datetime(2026, 12, 17, tzinfo=UTC),
        )
        self.assertEqual(future["eligibility"], "review_required")
        self.assertEqual(future["call_state"], "not_open")

    def test_interpretation_needs_facts_then_human_review(self):
        rule = boolean_rule() | {
            "id": "scope",
            "field": "project.innovation",
            "op": "review",
            "value_type": "string",
            "expected": None,
        }
        self.assertEqual(evaluate_rules({}, [rule], NOW)["eligibility"], "information_missing")
        self.assertEqual(
            evaluate_rules(
                {"project": {"innovation": "Scientific uncertainty evidence"}}, [rule], NOW
            )["eligibility"],
            "review_required",
        )

    def test_budget_total_is_decimal_derived_not_client_assertion(self):
        profile = {"budget": {"total": "1", "items": [{"amount": "0.10"}, {"amount": "0.20"}]}}
        self.assertEqual(field_value(profile, "budget.total"), "0.30")
        self.assertIsNone(field_value({"budget": {"total": "100"}}, "budget.total"))
        self.assertIsNone(field_value({"budget": {"items": [{"amount": "NaN"}]}}, "budget.total"))


class SelectedOfficialCatalogueTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = load_seed_catalog()

    def test_current_1501_known_limits_not_outdated_36_months(self):
        call = next(entry["call"] for entry in self.data["programs"] if entry["code"] == "TR-1501")
        duration = next(rule for rule in call["rules"] if rule["id"] == "duration_limit")
        self.assertEqual(
            evaluate_rules({"project": {"duration_months": 25}}, [duration], NOW)["eligibility"],
            "ineligible",
        )
        self.assertEqual(
            evaluate_rules({"project": {"duration_months": 24}}, [duration], NOW)["eligibility"],
            "eligible",
        )

    def test_bigg_real_current_call_closed_and_equity_not_old_grant(self):
        call = next(
            entry["call"] for entry in self.data["programs"] if entry["code"] == "TR-BIGG-1812"
        )
        result = evaluate_rules(
            {}, call["rules"], NOW, deadline=datetime.fromisoformat(call["deadline"])
        )
        self.assertEqual(result["eligibility"], "closed")


class SourceAndHttpBoundaries(unittest.TestCase):
    def test_unapproved_hosts_schemes_ports_and_credentials_rejected(self):
        for url in [
            "http://www.gov.uk/",
            "https://127.0.0.1/",
            "https://www.gov.uk.evil.example/",
            "https://user@www.gov.uk/",
            "https://www.gov.uk:8443/",
            "https://www.gov.uk/#fragment",
        ]:
            with self.subTest(url=url), self.assertRaises(SourceFetchError):
                validate_url(url)

    def test_mixed_and_ipv4_mapped_private_dns_answers_rejected(self):
        for addresses in [
            ["127.0.0.1"],
            ["93.184.216.34", "10.0.0.1"],
            ["::ffff:127.0.0.1"],
            ["169.254.169.254"],
        ]:
            records = [(2, 1, 6, "", (address, 443)) for address in addresses]
            with (
                self.subTest(addresses=addresses),
                patch("backend.source_watch.socket.getaddrinfo", return_value=records),
                self.assertRaises(SourceFetchError),
            ):
                public_addresses("www.gov.uk")

    def test_private_evaluation_admin_and_review_require_session(self):
        app = FastAPI()
        app.include_router(router)
        with TestClient(app) as client:
            requests = [
                ("POST", "/api/projects/private/evaluate", {"call_id": "call"}),
                ("GET", "/api/projects/private/evaluations", None),
                ("GET", "/api/evaluations/private", None),
                ("GET", "/api/admin/sources", None),
                ("GET", "/api/admin/sources/private/diff", None),
                (
                    "POST",
                    "/api/admin/calls/private/publish",
                    {"acknowledgement": "I reviewed the official sources and rules"},
                ),
                (
                    "POST",
                    "/api/evaluations/private/review",
                    {
                        "decisions": [
                            {
                                "condition_id": "scope",
                                "approved": True,
                                "notes": "Real source evidence reviewed",
                            }
                        ]
                    },
                ),
            ]
            for method, path, body in requests:
                with self.subTest(path=path):
                    self.assertEqual(client.request(method, path, json=body).status_code, 401)
