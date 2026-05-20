from flask import Blueprint, render_template, request, redirect, session
from BOFS.util import verify_correct_page, verify_session_valid
from BOFS.globals import db

# The variable name should match the folder name.
blueprint = Blueprint(
    'blueprint', __name__,
    static_url_path='/blueprint',
    template_folder='templates',
    static_folder='static',
)


@blueprint.route("/task/condition1", methods=["GET"])
@verify_correct_page
@verify_session_valid
def get_condition1():
    return task("Condition 1")
                                         
@blueprint.route("/task/condition2", methods=["GET"])
@verify_correct_page
@verify_session_valid
def get_condition2():
    return task("Condition 2")
                                         
@blueprint.route("/task/condition3", methods=["GET"])
@verify_correct_page
@verify_session_valid
def get_condition3():
    return task("Condition 3")


def task(condition: str):
    return render_template(
        "simple/task.html",
        condition=condition,
    )