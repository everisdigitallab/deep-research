"""Environment compatibility helpers."""

from __future__ import annotations

import os


def apply_env_compatibility() -> None:
    """Map common Azure/OpenAI env aliases to the names used by the project.

    This keeps existing behavior intact while allowing deployments that already
    use alternative variable names.
    """
    alias_pairs = (
        ("ENDPOINT_URL", "AZURE_OPENAI_ENDPOINT"),
        ("AZURE_API_VERSION", "AZURE_OPENAI_API_VERSION"),
        ("AZURE_API_VERSION", "OPENAI_API_VERSION"),
    )

    for source_name, target_name in alias_pairs:
        source_value = os.getenv(source_name)
        if source_value and not os.getenv(target_name):
            os.environ[target_name] = source_value

    deployment_name = os.getenv("DEPLOYMENT_NAME")
    if deployment_name:
        if not os.getenv("FAST_LLM"):
            os.environ["FAST_LLM"] = f"azure_openai:{deployment_name}"
        if not os.getenv("SMART_LLM"):
            os.environ["SMART_LLM"] = f"azure_openai:{deployment_name}"
        if not os.getenv("STRATEGIC_LLM"):
            os.environ["STRATEGIC_LLM"] = f"azure_openai:{deployment_name}"
