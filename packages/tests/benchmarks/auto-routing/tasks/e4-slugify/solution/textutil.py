import re

def slugify(text):
    """Turn a title into a URL slug.

    - lowercase
    - letters and digits are kept; every run of other characters becomes one hyphen
    - no leading or trailing hyphen
    - an input with no letters or digits gives the empty string
    """
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
