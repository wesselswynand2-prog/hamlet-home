"""Frontend sanity: no method defined twice in a component (a later one silently replaces the first)."""
import pathlib
import re

FRONT = pathlib.Path(__file__).parents[1] / "custom_components/hamlet_home/frontend"


def test_no_duplicate_methods():
    for js in FRONT.glob("*.js"):
        names = re.findall(r"^  (?:async )?(?:get |set )?(_[A-Za-z0-9]+)\(", js.read_text(), re.M)
        dups = sorted({n for n in names if names.count(n) > 1})
        assert not dups, f"{js.name}: {dups} defined twice"
