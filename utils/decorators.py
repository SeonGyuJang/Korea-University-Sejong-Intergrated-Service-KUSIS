"""
인증 및 권한 관련 데코레이터
"""
from functools import wraps
from flask import session, flash, redirect, url_for, g, request # request 임포트 추가

def _get_current_user():
    """현재 세션의 사용자 객체 반환"""
    from models import User, db

    if 'student_id' not in session:
        return None

    # g 객체에 사용자 정보를 저장하여 요청 내에서 재사용
    if not hasattr(g, 'user'):
        g.user = db.session.get(User, session['student_id'])
        if not g.user:
            session.clear() # 유효하지 않은 세션 정리
    return g.user

def login_required(f):
    """로그인이 필요한 라우트에 적용하는 데코레이터"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = _get_current_user()
        if not user:
            flash("로그인이 필요합니다.", "warning")
            # 'auth.login' -> 'login' 으로 수정
            return redirect(url_for('login', next=request.url))
        # g.user 설정이 데코레이터 내에서 이루어지므로,
        # 라우트 함수에서는 g.user를 직접 사용 가능
        return f(*args, **kwargs)
    return decorated_function

def post_manager_required(f):
    """게시물 관리 권한이 필요한 라우트에 적용하는 데코레이터"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = _get_current_user()
        if not user:
            flash("로그인이 필요합니다.", "warning")
            # 'auth.login' -> 'login' 으로 수정 (로그인 페이지로 리다이렉트 시)
            return redirect(url_for('login', next=request.url))
        if not user.can_manage_posts:
            flash("게시물 관리 권한이 없습니다.", "danger")
            return redirect(url_for('main.index')) # 혹은 접근 권한 없음 페이지
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    """관리자 권한이 필요한 라우트에 적용하는 데코레이터"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = _get_current_user()
        if not user:
            flash("로그인이 필요합니다.", "warning")
            # 'auth.login' -> 'login' 으로 수정
            return redirect(url_for('login', next=request.url))
        if not user.is_admin:
            flash("접근 권한이 없습니다. 관리자만 접근 가능합니다.", "danger")
            return redirect(url_for('main.index')) # 혹은 접근 권한 없음 페이지
        return f(*args, **kwargs)
    return decorated_function