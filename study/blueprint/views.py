"""
views.py

Flask Blueprint for the study task pages. Registers the `blueprint` Blueprint
with BOFS and defines one route per condition, each rendering the same task
template with a different condition_name argument.

BOFS decorators applied to every route:
  @verify_correct_page   — ensures the participant is at the right point in the
                           PAGE_LIST flow; redirects away if they are not
  @verify_session_valid  — ensures a valid BOFS session exists; redirects to the
                           start page if the session is missing or expired

To add a new condition: uncomment the condition3 route below, add the matching
entry to CONDITIONS and PAGE_LIST in config.toml, and handle the new
condition_name in react-ui.js / canvas-ui/views.js if it needs different UI behaviour.
"""

from flask import Blueprint, render_template
from BOFS.util import verify_correct_page, verify_session_valid

# ---------------------------------------------------------------------------
# MARK: Blueprint registration
# ---------------------------------------------------------------------------

# The Blueprint name and static_url_path must match the folder name so that
# url_for('blueprint.static', filename=...) resolves to /blueprint/<filename>.
blueprint = Blueprint(
    'blueprint', __name__,
    static_url_path='/blueprint',
    template_folder='templates',
    static_folder='static',
)

# ---------------------------------------------------------------------------
# MARK: Routes
# ---------------------------------------------------------------------------

@blueprint.route("/task/standard", methods=["GET"])
@verify_correct_page
@verify_session_valid
def get_standard():
    """Serves the task page for the Standard condition (VS Code-style IDE)."""
    return task("Standard")


@blueprint.route("/task/thumbview", methods=["GET"])
@verify_correct_page
@verify_session_valid
def get_thumbview():
    """Serves the task page for the Thumbview condition (spatial canvas overview)."""
    return task("Thumbview")


# @blueprint.route("/task/condition3", methods=["GET"])
# @verify_correct_page
# @verify_session_valid
# def get_condition3():
#     """Serves the task page for Condition 3."""
#     return task("Condition 3")

# ---------------------------------------------------------------------------
# MARK: Shared renderer
# ---------------------------------------------------------------------------

def task(condition_name: str):
    """
    Renders task.html with the given condition_name, which is injected into the
    page as a Jinja2 variable and becomes the `condition_name` global in JS.

    Args:
        condition_name: "Standard", "Thumbview", etc. Must match the label
                        used in config.toml's CONDITIONS list.
    """
    return render_template(
        "simple/task.html",
        condition_name=condition_name,
    )
