"""
인증 및 권한 관련 데코레이터
"""
from functools import wraps
from flask import session, flash, redirect, url_for, g

def _get_current_user():
    """현재 세션의 사용자 객체 반환"""
    from models import User, db

    if 'student_id' not in session:
        return None

    g.user = db.session.get(User, session['student_id'])
    if not g.user:
        session.clear()
    return g.user

def login_required(f):
    """로그인이 필요한 라우트에 적용하는 데코레이터"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = _get_current_user()
        if not user:
            flash("로그인이 필요합니다.", "warning")
            from flask import request
            return redirect(url_for('auth.login', next=request.url))
        return f(*args, **kwargs)
    return decorated_function

def post_manager_required(f):
    """게시물 관리 권한이 필요한 라우트에 적용하는 데코레이터"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = _get_current_user()
        if not user:
            flash("로그인이 필요합니다.", "warning")
            return redirect(url_for('auth.login'))
        if not user.can_manage_posts:
            flash("게시물 관리 권한이 없습니다.", "danger")
            return redirect(url_for('main.index'))
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    """관리자 권한이 필요한 라우트에 적용하는 데코레이터"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = _get_current_user()
        if not user:
            flash("로그인이 필요합니다.", "warning")
            return redirect(url_for('auth.login'))
        if not user.is_admin:
            flash("접근 권한이 없습니다. 관리자만 접근 가능합니다.", "danger")
            return redirect(url_for('main.index'))
        return f(*args, **kwargs)
    return decorated_function
