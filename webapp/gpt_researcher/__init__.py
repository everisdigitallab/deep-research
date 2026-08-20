from .utils.env_compat import apply_env_compatibility
from .agent import GPTResearcher

apply_env_compatibility()

__all__ = ['GPTResearcher']
