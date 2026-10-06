import os
import unittest

os.environ.setdefault("OPENAI_API_KEY", "test-key")

from backend.schemas import DimensionPlaybookData
from backend.services import (
    build_idea_chat_messages,
    get_funds_catalog,
)


class CatalogTests(unittest.TestCase):
    def test_loads_funds_catalog_successfully(self) -> None:
        funds = get_funds_catalog()
        self.assertGreaterEqual(len(funds), 4)

        fund_ids = [f.id for f in funds]
        self.assertEqual(len(fund_ids), len(set(fund_ids)), "Fund IDs must be unique")

        for fund in funds:
            self.assertTrue(fund.id)
            self.assertTrue(fund.code)
            self.assertTrue(fund.name)
            self.assertIn(fund.institution, {"TUBITAK", "KOSGEB", "EU"})
            self.assertTrue(fund.maxBudget)
            self.assertTrue(fund.supportRate)


class ChatPromptTests(unittest.TestCase):
    def test_build_idea_chat_messages_chat_mode(self) -> None:
        messages = build_idea_chat_messages(
            [{"role": "user", "text": "Merhabalar"}],
            mode="chat",
            language="tr",
        )
        self.assertEqual(len(messages), 2)
        self.assertEqual(messages[0]["role"], "system")
        self.assertIn("Respond in Turkish", messages[0]["content"])
        self.assertEqual(messages[1], {"role": "user", "content": "Merhabalar"})

    def test_build_idea_chat_messages_summary_mode(self) -> None:
        messages = build_idea_chat_messages(
            [{"role": "user", "text": "Proje fikrim"}],
            mode="summary",
            language="en",
        )
        self.assertEqual(len(messages), 3)
        self.assertEqual(messages[0]["role"], "system")
        self.assertIn("Respond in English", messages[0]["content"])
        self.assertEqual(messages[1]["role"], "user")
        self.assertEqual(messages[2]["role"], "system")
        self.assertIn("Project 1-Pager", messages[2]["content"])

    def test_build_idea_chat_messages_with_project_context(self) -> None:
        messages = build_idea_chat_messages(
            [{"role": "user", "text": "Detaylar"}],
            project_context="Titre - Description",
        )
        self.assertEqual(len(messages), 3)
        self.assertEqual(messages[0]["role"], "system")
        self.assertEqual(messages[1]["role"], "user")
        self.assertIn("Project context", messages[1]["content"])
        self.assertEqual(messages[2]["role"], "user")


class PlaybookSchemaTests(unittest.TestCase):
    def test_validates_dimension_playbook_data(self) -> None:
        data = {
            "dimension": "market",
            "key_questions": ["What is TAM?"],
            "common_mistakes": ["No market sizing"],
            "recommended_actions_by_stage": {
                "idea": ["Interview 10 users"],
                "mvp": ["Run landing page test"],
                "scale": ["Expand channels"],
            },
        }
        playbook = DimensionPlaybookData.model_validate(data)
        self.assertEqual(playbook.dimension, "market")
        self.assertEqual(playbook.key_questions, ["What is TAM?"])
        self.assertEqual(playbook.recommended_actions_by_stage.idea, ["Interview 10 users"])

    def test_playbook_defaults_on_minimal_input(self) -> None:
        playbook = DimensionPlaybookData(dimension="team")
        self.assertEqual(playbook.dimension, "team")
        self.assertEqual(playbook.key_questions, [])
        self.assertEqual(playbook.recommended_actions_by_stage.mvp, [])


if __name__ == "__main__":
    unittest.main()
