"""Grant administrator permission to an explicitly selected existing account.

Run locally: python -m backend.bootstrap_admin --email owner@example.org
Registration never grants administrator permission.
"""

import argparse
import asyncio

from sqlalchemy import select

from .db import AsyncSessionLocal
from .workspaces import User, normalize_email


async def grant_admin(email: str) -> None:
    async with AsyncSessionLocal() as session:
        user = (
            await session.execute(
                select(User).where(User.email == normalize_email(email)).with_for_update()
            )
        ).scalar_one_or_none()
        if user is None:
            raise SystemExit("Account not found; register the intended account first")
        user.is_admin = True
        await session.commit()
    print("Administrator permission granted to the explicitly selected account.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Explicit local administrator bootstrap (requires database access)"
    )
    parser.add_argument("--email", required=True, help="Existing registered account email")
    args = parser.parse_args()
    asyncio.run(grant_admin(args.email))


if __name__ == "__main__":
    main()
