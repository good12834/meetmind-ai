from datetime import datetime

from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import create_access_token

from extensions import db
from models.user import User
from utils.validation import (
    validate_name,
    validate_email,
    validate_password,
)

auth_bp = Blueprint("auth", __name__)


def _error(message, status_code):
    return jsonify({"success": False, "message": message}), status_code


# REGISTER
@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json() or {}

    name, name_err = validate_name(data.get("name"))
    if name_err:
        return _error(name_err, 400)

    email, email_err = validate_email(data.get("email"))
    if email_err:
        return _error(email_err, 400)

    password, password_err = validate_password(data.get("password"))
    if password_err:
        return _error(password_err, 400)

    if User.query.filter_by(email=email).first():
        return _error("Email already registered", 409)

    hashed_password = generate_password_hash(password)
    new_user = User(name=name, email=email, password_hash=hashed_password)
    db.session.add(new_user)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return _error("Failed to create account. Please try again.", 500)

    return jsonify({
        "success": True,
        "message": "Account created successfully",
        "user": {
            "id": new_user.id,
            "name": new_user.name,
            "email": new_user.email,
        },
    }), 201


# LOGIN
@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}

    email, email_err = validate_email(data.get("email"))
    if email_err:
        return _error("Invalid email or password", 401)

    password = data.get("password")
    if not password:
        return _error("Invalid email or password", 401)

    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password_hash, password):
        return _error("Invalid email or password", 401)

    access_token = create_access_token(identity=str(user.id))

    return jsonify({
        "success": True,
        "message": "Login successful",
        "access_token": access_token,
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
        },
    }), 200


# FORGOT PASSWORD
# Generates a single-use, time-limited reset token for the given email.
# In production this token should be emailed to the user; in development it is
# returned in the response so the flow can be verified end-to-end. The endpoint
# always returns a generic success message to avoid leaking whether an email
# is registered.
@auth_bp.route("/forgot-password", methods=["POST"])
def forgot_password():
    data = request.get_json() or {}

    email, email_err = validate_email(data.get("email"))
    if email_err:
        # Generic response: do not reveal whether the email exists.
        return jsonify({
            "success": True,
            "message": "If an account exists for that email, a reset link has been sent.",
        }), 200

    user = User.query.filter_by(email=email).first()
    if user:
        token = user.generate_reset_token()
        db.session.commit()
        # In production: email a reset link containing `token` to the user.
        return jsonify({
            "success": True,
            "message": "If an account exists for that email, a reset link has been sent.",
            # Dev-only: remove this field before deploying with real email delivery.
            "reset_token": token,
        }), 200

    return jsonify({
        "success": True,
        "message": "If an account exists for that email, a reset link has been sent.",
    }), 200


# RESET PASSWORD
# Validates the reset token (existence + expiry) and replaces the password.
@auth_bp.route("/reset-password", methods=["POST"])
def reset_password():
    data = request.get_json() or {}

    token = data.get("token")
    password, password_err = validate_password(data.get("password"))
    if password_err:
        return _error(password_err, 400)
    if not token:
        return _error("Reset token is required", 400)

    user = User.find_by_reset_token(token)
    if user is None:
        return _error("Invalid or expired reset token", 400)

    user.password_hash = generate_password_hash(password)
    user.clear_reset_token()
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return _error("Failed to reset password. Please try again.", 500)

    return jsonify({
        "success": True,
        "message": "Password reset successfully. You can now sign in with your new password.",
    }), 200
