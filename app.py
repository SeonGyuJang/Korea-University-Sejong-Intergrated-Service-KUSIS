# app.py - 모듈화된 Flask 애플리케이션
from flask import Flask, render_template, jsonify, request, redirect, url_for, session, flash, abort, send_from_directory
from datetime import datetime, timedelta, date
import json
import os
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
import urllib.parse
from dotenv import load_dotenv
from apscheduler.schedulers.background import BackgroundScheduler
import atexit
from sqlalchemy import inspect, func, text, desc, or_
import pytz

# 모듈 import
from models import db, User, Semester, Subject, TimeSlot, Schedule, StudyLog, Todo, Post, CalendarCategory, CalendarEvent
from utils.constants import *
from utils.decorators import login_required, post_manager_required, admin_required
from utils.helpers import sort_semesters, calculate_gpa, allowed_file as _allowed_file
from services import (
    load_academic_calendar,
    get_semester_start_date,
    _get_semester_start_date_fallback,
    create_semesters_for_user,
    manage_semesters_job,
    load_meal_data,
    get_today_meal_key,
    format_meal_for_client,
    format_weekly_meal_for_client,
    load_bus_schedule,
    initialize_system_categories,
    initialize_system_events,
    create_default_categories_for_user
)

load_dotenv()

app = Flask(__name__)

# --- Configuration ---
FLASK_SECRET_KEY = os.getenv('FLASK_SECRET_KEY')
if not FLASK_SECRET_KEY:
    raise RuntimeError("FLASK_SECRET_KEY environment variable must be set for security")
app.secret_key = FLASK_SECRET_KEY
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=1)
app.config['SESSION_TYPE'] = 'filesystem'

DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_NAME = os.getenv("DB_NAME")

ENCODED_PASSWORD = urllib.parse.quote_plus(DB_PASSWORD)
app.config['SQLALCHEMY_DATABASE_URI'] = f'postgresql://{DB_USER}:{ENCODED_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# --- 파일 업로드 설정 ---
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'static', 'uploads')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_IMAGE_UPLOADS'] = MAX_IMAGE_UPLOADS

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

def allowed_file(filename):
    return _allowed_file(filename, ALLOWED_EXTENSIONS)

# Initialize database with app
db.init_app(app)

# --- 시간대 설정 ---
KST = pytz.timezone('Asia/Seoul')

# --- Jinja2 필터 추가 ---
@app.template_filter('kst')
def format_datetime_kst(value, format='%Y-%m-%d %H:%M'):
    """UTC 시간을 KST로 변환하고 지정된 형식으로 포맷하는 필터"""
    if value is None:
        return ""
    if isinstance(value, str):
        try:
            # 문자열을 naive datetime 객체로 파싱 (UTC로 가정)
            value = datetime.strptime(value, '%Y-%m-%dT%H:%M:%S.%f') # ISO 형식 등 DB 저장 형식에 맞게 조정 필요
        except ValueError:
             try:
                value = datetime.strptime(value, '%Y-%m-%d %H:%M:%S') # 다른 형식 시도
             except ValueError:
                 return value # 파싱 실패 시 원본 반환
    # 시간대 정보가 없는 naive datetime이면 UTC로 가정
    if value.tzinfo is None:
        utc_dt = pytz.utc.localize(value)
    else:
        utc_dt = value.astimezone(pytz.utc)

    kst_dt = utc_dt.astimezone(KST)
    return kst_dt.strftime(format)

# --- Flask CLI 명령어 ---
@app.cli.command("init-db")
def init_db_command():
    """Creates the database tables and initial data."""
    with app.app_context():
        create_initial_data()
    print("Database initialized.")



# --- DB 초기화 함수 ---
def create_initial_data():
    db.create_all()

    try:
        inspector = inspect(db.engine)

        # User 테이블 마이그레이션 (permission)
        user_columns = [col['name'] for col in inspector.get_columns('users')]
        if 'permission' not in user_columns:
            print("--- [MIGRATION] 'permission' column not found in 'users' table. Adding column... ---")
            db.session.execute(text("ALTER TABLE users ADD COLUMN permission VARCHAR(20) NOT NULL DEFAULT 'general'"))
            db.session.execute(text("UPDATE users SET permission = 'general' WHERE permission IS NULL"))
            print("--- [MIGRATION] 'permission' column added and initialized. ---")
        # User 테이블 마이그레이션 (total_credits_goal)
        if 'total_credits_goal' not in user_columns:
            print("--- [MIGRATION] 'total_credits_goal' column not found in 'users' table. Adding column... ---")
            db.session.execute(text("ALTER TABLE users ADD COLUMN total_credits_goal INTEGER NOT NULL DEFAULT 130"))
            print("--- [MIGRATION] 'total_credits_goal' column added with default 130. ---")

        # Semester 테이블 마이그레이션 (start_date)
        semester_columns = [col['name'] for col in inspector.get_columns('semesters')]
        if 'start_date' not in semester_columns:
            print("--- [MIGRATION] 'start_date' column not found in 'semesters' table. Adding column... ---")
            db.session.execute(text("ALTER TABLE semesters ADD COLUMN start_date DATE NULL"))
            print("--- [MIGRATION] 'start_date' column added. ---")


        # Subject 테이블 마이그레이션 (memo)
        subject_columns = [col['name'] for col in inspector.get_columns('subjects')]
        if 'memo' not in subject_columns:
             print("--- [MIGRATION] 'memo' column not found in 'subjects' table. Adding column... ---")
             db.session.execute(text("ALTER TABLE subjects ADD COLUMN memo TEXT DEFAULT '{\"note\": \"\", \"todos\": []}'"))
             db.session.execute(text("UPDATE subjects SET memo = '{\"note\": \"\", \"todos\": []}' WHERE memo IS NULL"))
             print("--- [MIGRATION] 'memo' column added and initialized. ---")

        # --- Post 테이블 마이그레이션 수정 ---
        post_columns = [col['name'] for col in inspector.get_columns('posts')]

        # image_filename -> image_filenames 로 변경 및 Text 타입 확인/변경
        if 'image_filename' in post_columns and 'image_filenames' not in post_columns:
            print("--- [MIGRATION] Found 'image_filename' column in 'posts'. Renaming and changing type to TEXT... ---")
            # PostgreSQL 기준: ALTER TABLE posts RENAME COLUMN image_filename TO image_filenames; ALTER TABLE posts ALTER COLUMN image_filenames TYPE TEXT;
            # SQLite 기준: ALTER TABLE posts RENAME COLUMN image_filename TO image_filenames; -- 타입 변경 불가, 새 테이블 생성 후 데이터 복사 필요
            # MySQL 기준: ALTER TABLE posts CHANGE COLUMN image_filename image_filenames TEXT NULL;
            # 여기서는 PostgreSQL 기준으로 작성 (실제 DB에 맞게 수정 필요)
            try:
                db.session.execute(text("ALTER TABLE posts RENAME COLUMN image_filename TO image_filenames"))
                db.session.execute(text("ALTER TABLE posts ALTER COLUMN image_filenames TYPE TEXT"))
                print("--- [MIGRATION] 'image_filenames' column renamed and type changed to TEXT. ---")
            except Exception as migrate_e:
                print(f"--- [MIGRATION] ERROR renaming/altering 'image_filename': {migrate_e} ---")
                print("--- [MIGRATION] Manual migration might be required. ---")
        elif 'image_filenames' not in post_columns:
             print("--- [MIGRATION] 'image_filenames' column not found in 'posts' table. Adding column (TEXT)... ---")
             db.session.execute(text("ALTER TABLE posts ADD COLUMN image_filenames TEXT NULL"))
             print("--- [MIGRATION] 'image_filenames' column added. ---")
        else:
             # 이미 image_filenames 컬럼이 존재할 경우, 타입 확인 (선택적)
             col_info = next((col for col in inspector.get_columns('posts') if col['name'] == 'image_filenames'), None)
             if col_info and not isinstance(col_info['type'], (db.Text, db.UnicodeText)):
                 print(f"--- [MIGRATION] 'image_filenames' column exists but is not TEXT type ({col_info['type']}). Attempting to alter... ---")
                 try:
                    # PostgreSQL 기준
                    db.session.execute(text("ALTER TABLE posts ALTER COLUMN image_filenames TYPE TEXT"))
                    print("--- [MIGRATION] 'image_filenames' column type changed to TEXT. ---")
                 except Exception as alter_e:
                    print(f"--- [MIGRATION] ERROR altering 'image_filenames' type: {alter_e}. Manual check needed. ---")


        if 'category' not in post_columns:
            print("--- [MIGRATION] 'category' column not found in 'posts' table. Adding column... ---")
            db.session.execute(text("ALTER TABLE posts ADD COLUMN category VARCHAR(50) DEFAULT '일반'"))
            print("--- [MIGRATION] 'category' column added with default '일반'. ---")

        if 'expires_at' not in post_columns:
            print("--- [MIGRATION] 'expires_at' column not found in 'posts' table. Adding column... ---")
            # PostgreSQL 기준. SQLite는 DATETIME, MySQL은 DATETIME
            db.session.execute(text("ALTER TABLE posts ADD COLUMN expires_at TIMESTAMP WITHOUT TIME ZONE NULL"))
            print("--- [MIGRATION] 'expires_at' column added. ---")

        if 'is_visible' not in post_columns:
            print("--- [MIGRATION] 'is_visible' column not found in 'posts' table. Adding column... ---")
            db.session.execute(text("ALTER TABLE posts ADD COLUMN is_visible BOOLEAN NOT NULL DEFAULT TRUE"))
            print("--- [MIGRATION] 'is_visible' column added with default TRUE. ---")

        # --- CalendarEvent 테이블 마이그레이션 (모든 필드) ---
        if inspector.has_table('calendar_events'):
            # 매번 최신 컬럼 목록을 가져와야 함
            def get_calendar_columns():
                return [col['name'] for col in inspector.get_columns('calendar_events')]

            # 기존 잘못된 컬럼 삭제 (개별 처리)
            if 'start' in get_calendar_columns():
                print("--- [MIGRATION] Removing old 'start' column from 'calendar_events' table... ---")
                try:
                    db.session.execute(text("ALTER TABLE calendar_events DROP COLUMN start"))
                    db.session.commit()
                    print("--- [MIGRATION] 'start' column removed successfully! ---")
                except Exception as e:
                    db.session.rollback()
                    print(f"--- [MIGRATION] ERROR removing 'start': {e} ---")

            if 'end' in get_calendar_columns():
                print("--- [MIGRATION] Removing old 'end' column from 'calendar_events' table... ---")
                try:
                    db.session.execute(text("ALTER TABLE calendar_events DROP COLUMN end"))
                    db.session.commit()
                    print("--- [MIGRATION] 'end' column removed successfully! ---")
                except Exception as e:
                    db.session.rollback()
                    print(f"--- [MIGRATION] ERROR removing 'end': {e} ---")

            # start_date 컬럼 추가 (개별 커밋)
            if 'start_date' not in get_calendar_columns():
                print("--- [MIGRATION] Adding 'start_date' column to 'calendar_events' table... ---")
                try:
                    db.session.execute(text("ALTER TABLE calendar_events ADD COLUMN start_date DATE NOT NULL DEFAULT CURRENT_DATE"))
                    db.session.commit()
                    print("--- [MIGRATION] 'start_date' column added successfully! ---")
                except Exception as e:
                    db.session.rollback()
                    print(f"--- [MIGRATION] ERROR adding 'start_date': {e} ---")

            # end_date 컬럼 추가 (개별 커밋)
            if 'end_date' not in get_calendar_columns():
                print("--- [MIGRATION] Adding 'end_date' column to 'calendar_events' table... ---")
                try:
                    db.session.execute(text("ALTER TABLE calendar_events ADD COLUMN end_date DATE NULL"))
                    db.session.commit()
                    print("--- [MIGRATION] 'end_date' column added successfully! ---")
                except Exception as e:
                    db.session.rollback()
                    print(f"--- [MIGRATION] ERROR adding 'end_date': {e} ---")

            # start_time 컬럼 추가 (개별 커밋)
            if 'start_time' not in get_calendar_columns():
                print("--- [MIGRATION] Adding 'start_time' column to 'calendar_events' table... ---")
                try:
                    db.session.execute(text("ALTER TABLE calendar_events ADD COLUMN start_time TIME NULL"))
                    db.session.commit()
                    print("--- [MIGRATION] 'start_time' column added successfully! ---")
                except Exception as e:
                    db.session.rollback()
                    print(f"--- [MIGRATION] ERROR adding 'start_time': {e} ---")

            # end_time 컬럼 추가 (개별 커밋)
            if 'end_time' not in get_calendar_columns():
                print("--- [MIGRATION] Adding 'end_time' column to 'calendar_events' table... ---")
                try:
                    db.session.execute(text("ALTER TABLE calendar_events ADD COLUMN end_time TIME NULL"))
                    db.session.commit()
                    print("--- [MIGRATION] 'end_time' column added successfully! ---")
                except Exception as e:
                    db.session.rollback()
                    print(f"--- [MIGRATION] ERROR adding 'end_time': {e} ---")

            # all_day 컬럼 추가 (개별 커밋)
            if 'all_day' not in get_calendar_columns():
                print("--- [MIGRATION] Adding 'all_day' column to 'calendar_events' table... ---")
                try:
                    db.session.execute(text("ALTER TABLE calendar_events ADD COLUMN all_day BOOLEAN NOT NULL DEFAULT TRUE"))
                    db.session.commit()
                    print("--- [MIGRATION] 'all_day' column added successfully! ---")
                except Exception as e:
                    db.session.rollback()
                    print(f"--- [MIGRATION] ERROR adding 'all_day': {e} ---")

            # description 컬럼 추가 (개별 커밋)
            if 'description' not in get_calendar_columns():
                print("--- [MIGRATION] Adding 'description' column to 'calendar_events' table... ---")
                try:
                    db.session.execute(text("ALTER TABLE calendar_events ADD COLUMN description TEXT NULL"))
                    db.session.commit()
                    print("--- [MIGRATION] 'description' column added successfully! ---")
                except Exception as desc_e:
                    db.session.rollback()
                    print(f"--- [MIGRATION] ERROR adding 'description': {desc_e} ---")

            # recurrence_type 컬럼 추가 (개별 커밋)
            if 'recurrence_type' not in get_calendar_columns():
                print("--- [MIGRATION] Adding 'recurrence_type' column to 'calendar_events' table... ---")
                try:
                    db.session.execute(text("ALTER TABLE calendar_events ADD COLUMN recurrence_type VARCHAR(20) NULL"))
                    db.session.commit()
                    print("--- [MIGRATION] 'recurrence_type' column added successfully! ---")
                except Exception as rec_e:
                    db.session.rollback()
                    print(f"--- [MIGRATION] ERROR adding 'recurrence_type': {rec_e} ---")

            # recurrence_end_date 컬럼 추가 (개별 커밋)
            if 'recurrence_end_date' not in get_calendar_columns():
                print("--- [MIGRATION] Adding 'recurrence_end_date' column to 'calendar_events' table... ---")
                try:
                    db.session.execute(text("ALTER TABLE calendar_events ADD COLUMN recurrence_end_date DATE NULL"))
                    db.session.commit()
                    print("--- [MIGRATION] 'recurrence_end_date' column added successfully! ---")
                except Exception as end_e:
                    db.session.rollback()
                    print(f"--- [MIGRATION] ERROR adding 'recurrence_end_date': {end_e} ---")

            # recurrence_interval 컬럼 추가 (개별 커밋)
            if 'recurrence_interval' not in get_calendar_columns():
                print("--- [MIGRATION] Adding 'recurrence_interval' column to 'calendar_events' table... ---")
                try:
                    db.session.execute(text("ALTER TABLE calendar_events ADD COLUMN recurrence_interval INTEGER DEFAULT 1"))
                    db.session.commit()
                    print("--- [MIGRATION] 'recurrence_interval' column added successfully! ---")
                except Exception as int_e:
                    db.session.rollback()
                    print(f"--- [MIGRATION] ERROR adding 'recurrence_interval': {int_e} ---")

        # --- 마이그레이션 끝 ---

        # DailyMemo 테이블 삭제 (존재할 경우)
        if inspector.has_table('daily_memos'):
             print("--- [MIGRATION] Found obsolete 'daily_memos' table. Dropping... ---")
             db.session.execute(text("DROP TABLE daily_memos"))
             print("--- [MIGRATION] 'daily_memos' table dropped. ---")

        db.session.commit()

    except Exception as e:
        db.session.rollback()
        print(f"--- [MIGRATION] CRITICAL: Error during schema migration: {e} ---")
        # 마이그레이션 실패 시에도 앱은 계속 실행되도록 함

    try:
        admin_id = "9999999999"
        if not db.session.get(User, admin_id):
            admin_password = os.getenv('ADMIN_DEFAULT_PASSWORD')
            if not admin_password:
                print("WARNING: ADMIN_DEFAULT_PASSWORD not set. Skipping admin user creation.")
            else:
                admin_user = User(
                    id=admin_id,
                    name="관리자",
                    dob="1900-01-01",
                    college="관리팀",
                    department="시스템 관리",
                    password_hash=generate_password_hash(admin_password),
                    permission='admin'
                )
                db.session.add(admin_user)
                print(f"Admin user '{admin_id}' created.")

        sample_user_id = "2023390822"
        if not db.session.get(User, sample_user_id):
            sample_user = User(
                id=sample_user_id,
                name="장성유",
                dob="2000-01-01",
                college="과학기술대학",
                department="컴퓨터융합소프트웨어학과",
                password_hash=generate_password_hash("1234"),
                permission='general',
                total_credits_goal=135
            )
            db.session.add(sample_user)
            print(f"Sample user '{sample_user_id}' created.")

        db.session.commit()

        if db.session.get(User, sample_user_id):
            create_semesters_for_user(sample_user_id)

        if db.session.get(User, admin_id):
            create_semesters_for_user(admin_id)

        db.session.commit()

        # 캘린더 시스템 초기화
        print("--- [CALENDAR] Initializing calendar system... ---")
        initialize_system_categories()
        initialize_system_events()

        # 사용자에게 기본 카테고리 생성
        if db.session.get(User, sample_user_id):
            create_default_categories_for_user(sample_user_id)
        if db.session.get(User, admin_id):
            create_default_categories_for_user(admin_id)

        db.session.commit()
        print("--- [CALENDAR] Calendar system initialized. ---")

    except Exception as e:
        db.session.rollback()
        print(f"Error creating initial data: {e}")



# --- 앱 시작 시 데이터 로드 ---
SHUTTLE_SCHEDULE_DATA = load_bus_schedule()
MEAL_PLAN_DATA = load_meal_data()
TODAY_MEAL_KEY = get_today_meal_key()
# --- 페이지 엔드포인트 ---
@app.route('/')
def index():
    user_info = None
    if 'student_id' in session:
        user_info = db.session.get(User, session['student_id'])
        if not user_info:
            session.clear() # 유효하지 않은 세션 정리
    return render_template('index.html', user=user_info)


@app.route('/timetable-management')
@login_required
def timetable_management():
    # g.user는 login_required 데코레이터에서 설정됨
    from flask import g
    user = g.user

    all_user_subjects = Subject.query.filter_by(user_id=user.id).all()

    # 총 이수 학점
    total_earned_credits = sum(subject.credits for subject in all_user_subjects)

    # 전체 평점 계산
    GRADE_MAP = {
        "A+": 4.5, "A0": 4.0, "B+": 3.5, "B0": 3.0,
        "C+": 2.5, "C0": 2.0, "D+": 1.5, "D0": 1.0, "F": 0.0
    }
    total_gpa_credits = 0
    total_gpa_score = 0

    for subject in all_user_subjects:
        grade_score = GRADE_MAP.get(subject.grade)
        if grade_score is not None: # 'Not Set' 등은 제외
            total_gpa_credits += subject.credits
            total_gpa_score += (grade_score * subject.credits)

    overall_gpa = (total_gpa_score / total_gpa_credits) if total_gpa_credits > 0 else 0.0

    current_goal = user.total_credits_goal
    remaining_credits = max(0, current_goal - total_earned_credits)

    return render_template(
        'timetable_management.html',
        user=user,
        current_credits=total_earned_credits,
        goal_credits=current_goal,
        remaining_credits=remaining_credits,
        overall_gpa=round(overall_gpa, 2)
    )

# --- Authentication Routes ---
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        student_id = request.form.get('student_id')
        password = request.form.get('password')

        user = db.session.get(User, student_id)

        if user and check_password_hash(user.password_hash, password):
            session.clear() # 기존 세션 정리
            session['student_id'] = user.id
            session.permanent = True # 세션 유지 시간 설정 (Config에서)
            app.permanent_session_lifetime = timedelta(hours=1) # 1시간

            flash(f"{user.name}님, KUSIS에 오신 것을 환영합니다.", "success")

            next_page = request.args.get('next')
            return redirect(next_page or url_for('index'))
        else:
            flash("학번 또는 비밀번호가 일치하지 않습니다.", "danger")

    return render_template('login.html')

@app.route('/logout')
def logout():
    session.clear()
    flash("로그아웃 되었습니다.", "info")
    return redirect(url_for('index'))

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        name = request.form.get('name')
        student_id = request.form.get('student_id')
        password = request.form.get('password')
        password_confirm = request.form.get('password_confirm')
        dob = request.form.get('dob') # 생년월일 (YYYY-MM-DD)
        college = request.form.get('college')
        department = request.form.get('department')

        if not all([name, student_id, password, password_confirm, dob, college, department]):
            flash("모든 필드를 입력해주세요.", "danger")
            return render_template('register.html', colleges=COLLEGES)

        if password != password_confirm:
            flash("비밀번호가 일치하지 않습니다.", "danger")
            return render_template('register.html', colleges=COLLEGES)

        if db.session.get(User, student_id):
            flash("이미 가입된 학번입니다.", "danger")
            return render_template('register.html', colleges=COLLEGES)

        try:
            hashed_password = generate_password_hash(password, method='pbkdf2:sha256')
            new_user = User(
                id=student_id,
                name=name,  
                dob=dob,
                college=college,
                department=department,
                password_hash=hashed_password,
                permission='general', # 기본 권한
                total_credits_goal=130 # 기본 목표 학점
            )
            db.session.add(new_user)
            db.session.commit()

            # 새 사용자를 위한 학기 데이터 생성
            create_semesters_for_user(new_user.id)

            # 새 사용자를 위한 기본 캘린더 카테고리 생성
            create_default_categories_for_user(new_user.id)

            flash("회원가입이 성공적으로 완료되었습니다. 로그인해주세요.", "success")
            return redirect(url_for('login'))
        except Exception as e:
            db.session.rollback()
            print(f"Error during registration: {e}")
            flash(f"회원가입 중 오류가 발생했습니다: {e}", "danger")

    return render_template('register.html', colleges=COLLEGES)

# --- 관리자 대시보드 라우트 ---
@app.route('/admin')
@admin_required
def admin_dashboard():
    # 정렬 기준
    sort_by = request.args.get('sort_by', 'id')
    sort_order = request.args.get('sort_order', 'asc')

    query = User.query

    # 정렬 적용
    if sort_by == 'department':
        order_column = User.department
    elif sort_by == 'name':
        order_column = User.name
    elif sort_by == 'permission':
        order_column = User.permission
    else: # 기본: id (학번)
        order_column = User.id

    query = query.order_by(order_column.desc() if sort_order == 'desc' else order_column.asc())

    all_users = query.all()
    member_count = len(all_users)

    # 학과 목록 (중복 제거 및 정렬)
    departments = sorted(list(set(user.department for user in all_users if user.department)))

    permission_map = {'general': '일반회원', 'associate': '협력회원', 'admin': '관리자'}

    member_list_data = [
        {
            "id": user.id,
            "name": user.name,
            "college": user.college,
            "department": user.department,
            "permission": user.permission,
            "permission_display": permission_map.get(user.permission, user.permission)
        }
        for user in all_users
    ]

    return render_template(
        'admin.html',
        member_count=member_count,
        member_list=member_list_data,
        colleges=COLLEGES,
        departments=departments,
        permission_map=permission_map,
        current_sort_by=sort_by,
        current_sort_order=sort_order
    )


# --- 관리자 기능 API 엔드포인트 ---
@app.route('/admin/users/<string:user_id>/permission', methods=['POST'])
@admin_required
def admin_update_permission(user_id):
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"status": "error", "message": "사용자를 찾을 수 없습니다."}), 404

    new_permission = request.json.get('permission')
    if new_permission not in ['general', 'associate', 'admin']:
        return jsonify({"status": "error", "message": "유효하지 않은 권한입니다."}), 400

    try:
        user.permission = new_permission
        db.session.commit()
        permission_map = {'general': '일반회원', 'associate': '협력회원', 'admin': '관리자'}
        return jsonify({
            "status": "success",
            "message": f"'{user.name}'님의 권한이 '{permission_map.get(new_permission, new_permission)}'(으)로 변경되었습니다.",
            "new_permission": new_permission,
            "new_permission_display": permission_map.get(new_permission, new_permission)
        })
    except Exception as e:
        db.session.rollback()
        print(f"Error updating permission for {user_id}: {e}")
        return jsonify({"status": "error", "message": f"권한 업데이트 중 오류 발생: {e}"}), 500

@app.route('/admin/users/<string:user_id>', methods=['DELETE'])
@admin_required
def admin_delete_user(user_id):
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"status": "error", "message": "사용자를 찾을 수 없습니다."}), 404

    # 자기 자신 삭제 방지
    if user.id == session.get('student_id'):
        return jsonify({"status": "error", "message": "자기 자신을 삭제할 수 없습니다."}), 403

    try:
        # 사용자가 작성한 게시물 및 관련 이미지 파일 먼저 삭제
        posts_to_delete = Post.query.filter_by(author_id=user_id).all()
        for post in posts_to_delete:
            # --- 수정: 여러 이미지 파일 삭제 ---
            filenames_to_delete = post.image_filenames.split(',') if post.image_filenames else []
            for filename in filenames_to_delete:
                try:
                    image_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                    if os.path.exists(image_path):
                        os.remove(image_path)
                        print(f"Deleted image file: {image_path}")
                except Exception as img_e:
                    # 이미지 삭제 실패 시 로그만 남기고 계속 진행
                    print(f"Error deleting image file {filename} for user {user_id}: {img_e}")
            # --- 수정 끝 ---

        # 사용자 삭제 (관련 데이터는 cascade delete 설정에 따라 삭제됨)
        db.session.delete(user)
        db.session.commit()

        return jsonify({"status": "success", "message": f"사용자 '{user.name}'({user_id}) 계정 및 관련 데이터(게시물 포함)가 삭제되었습니다."})
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting user {user_id}: {e}")
        return jsonify({"status": "error", "message": f"사용자 삭제 중 오류 발생: {e}"}), 500


# --- 게시물 관리 라우트 ---
@app.route('/post_management')
@post_manager_required
def post_management():
    from flask import g
    user = g.user

    pending_posts = []
    approved_posts = []

    # is_visible 필터링 추가 (승인된 게시물에만 적용)
    if user.is_admin:
        # 관리자: 모든 승인 대기, 모든 승인된 글 (숨김 포함)
        pending_posts = Post.query.filter_by(is_approved=False).order_by(desc(Post.created_at)).all()
        approved_posts = Post.query.filter_by(is_approved=True).order_by(desc(Post.created_at)).all()
    elif user.is_associate:
        # 협력직원: 자신의 승인 대기, is_visible=True인 승인된 글
        pending_posts = Post.query.filter_by(author_id=user.id, is_approved=False).order_by(desc(Post.created_at)).all()
        approved_posts = Post.query.filter_by(is_approved=True, is_visible=True).order_by(desc(Post.created_at)).all()

    return render_template('post_management.html',
                           user=user,
                           pending_posts=pending_posts,
                           approved_posts=approved_posts)

# --- 게시물 생성 라우트 수정 ---
@app.route('/post/create', methods=['GET', 'POST'])
@post_manager_required
def create_post():
    from flask import g
    user = g.user
    post_categories = ['공지', '홍보', '안내', '업데이트', '일반'] # 카테고리 목록
    MAX_UPLOADS = app.config['MAX_IMAGE_UPLOADS']

    if request.method == 'POST':
        title = request.form.get('title')
        content = request.form.get('content')
        is_notice = 'is_notice' in request.form
        image_files = request.files.getlist('images') # <<< 수정: 여러 파일 받기
        category = request.form.get('category', '일반')
        expires_at_str = request.form.get('expires_at')

        if not title or not content:
            flash('제목과 내용은 필수입니다.', 'danger')
            return render_template('create_post.html', user=user, title=title, content=content, is_notice=is_notice, categories=post_categories, category=category, expires_at=expires_at_str, config=app.config)

        if category not in post_categories:
            flash('유효하지 않은 카테고리입니다.', 'warning')
            category = '일반' # 기본값으로 설정

        uploaded_filenames = []
        expires_at_dt = None

        try:
            # 노출 기한 처리 (기존 유지)
            if expires_at_str:
                 try:
                    naive_dt = datetime.strptime(expires_at_str, '%Y-%m-%dT%H:%M')
                    kst_dt = KST.localize(naive_dt)
                    expires_at_dt = kst_dt.astimezone(pytz.utc)
                 except ValueError:
                    flash('노출 기한 형식이 잘못되었습니다. 비워두거나 YYYY-MM-DDTHH:MM 형식으로 입력하세요.', 'warning')
                    return render_template('create_post.html', user=user, title=title, content=content, is_notice=is_notice, categories=post_categories, category=category, expires_at=expires_at_str, config=app.config)

            # --- 이미지 파일 처리 (여러 개, 최대 MAX_UPLOADS개) ---
            # 실제로 파일이 선택된 것만 필터링
            actual_files = [f for f in image_files if f and f.filename != '']
            valid_files = [f for f in actual_files if allowed_file(f.filename)]

            if len(valid_files) > MAX_UPLOADS:
                flash(f'이미지는 최대 {MAX_UPLOADS}개까지 첨부할 수 있습니다.', 'warning')
                return render_template('create_post.html', user=user, title=title, content=content, is_notice=is_notice, categories=post_categories, category=category, expires_at=expires_at_str, config=app.config)

            # 실제 파일이 있고, 유효하지 않은 파일이 있는 경우에만 경고
            if actual_files and len(actual_files) > len(valid_files):
                 flash('허용되지 않는 파일 형식(png, jpg, jpeg, gif)이 포함되어 제외되었습니다.', 'warning')


            for image_file in valid_files:
                filename = secure_filename(image_file.filename)
                timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
                # 파일명 중복 가능성 줄이기 (랜덤 문자 추가 등 고려 가능)
                unique_filename = f"{timestamp}_{user.id}_{filename}"
                save_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
                try:
                    image_file.save(save_path)
                    uploaded_filenames.append(unique_filename)
                except Exception as save_e:
                     # 개별 파일 저장 실패 시 로그 남기고 계속 진행 (선택적)
                     print(f"Error saving file {filename}: {save_e}")
                     flash(f"파일 '{filename}' 저장 중 오류 발생.", "danger")
                     # 저장 실패 시 롤백 로직 필요
                     # 이미 저장된 파일들 삭제
                     for fname in uploaded_filenames:
                         fpath = os.path.join(app.config['UPLOAD_FOLDER'], fname)
                         if os.path.exists(fpath): os.remove(fpath)
                     raise save_e # 오류를 다시 발생시켜 롤백 유도

            # --- 이미지 파일명 리스트를 문자열로 변환 (쉼표 구분) ---
            image_filenames_str = ",".join(uploaded_filenames) if uploaded_filenames else None

            # 관리자는 즉시 승인
            is_approved = user.is_admin

            new_post = Post(
                title=title,
                content=content.replace('\n', '<br>'),
                author_id=user.id,
                is_approved=is_approved,
                is_notice=is_notice,
                image_filenames=image_filenames_str, # <<< 수정됨
                category=category,
                expires_at=expires_at_dt,
                is_visible=True
            )
            db.session.add(new_post)
            db.session.commit()

            flash('게시물이 성공적으로 작성되었습니다.' + (' 관리자 승인 후 공지사항에 표시됩니다.' if not is_approved else ''), 'success')
            return redirect(url_for('post_management'))

        except Exception as e:
            db.session.rollback()
            # 롤백 시 저장된 이미지 파일 삭제
            for filename in uploaded_filenames:
                 filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                 if os.path.exists(filepath):
                     try:
                         os.remove(filepath)
                     except Exception as img_e:
                         print(f"Error rolling back image file {filename}: {img_e}")

            flash(f'게시물 작성 중 오류 발생: {e}', 'danger')
            print(f"Error creating post: {e}")
            # 오류 발생 시 입력값 유지하며 템플릿 렌더링
            return render_template('create_post.html', user=user, title=title, content=content, is_notice=is_notice, categories=post_categories, category=category, expires_at=expires_at_str, config=app.config)


    # GET 요청 시
    return render_template('create_post.html', user=user, categories=post_categories, config=app.config)


# --- 게시물 보기 라우트 수정 ---
@app.route('/post/<int:post_id>')
@login_required
def view_post(post_id):
    from flask import g
    user = g.user
    post = db.session.get(Post, post_id)

    if not post:
        abort(404)

    # 요구사항 4: 관리자가 아니고, 게시물이 숨김 상태이면 접근 불가
    if not post.is_visible and (not user or not user.is_admin):
         flash("현재 볼 수 없는 게시물입니다.", "warning")
         return redirect(url_for('index'))

    # 승인되지 않았고, (관리자도 아니고) AND (작성자 본인도 아니면) 접근 불가
    if not post.is_approved:
        if not user or (not user.is_admin and user.id != post.author_id):
            flash("승인되지 않은 게시물입니다.", "warning")
            if user and user.can_manage_posts:
                return redirect(url_for('post_management'))
            else:
                return redirect(url_for('index'))

    # --- 이미지 파일명 리스트 준비 ---
    image_filenames_list = post.image_filenames.split(',') if post.image_filenames else []

    return render_template('view_post.html', post=post, user=user, image_filenames=image_filenames_list) # 리스트 전달


# --- 게시물 수정 라우트 (대폭 수정) ---
@app.route('/post/<int:post_id>/edit', methods=['GET', 'POST'])
@login_required
def edit_post(post_id):
    from flask import g
    user = g.user
    post = db.session.get(Post, post_id)
    post_categories = ['공지', '홍보', '안내', '업데이트', '일반']
    MAX_UPLOADS = app.config['MAX_IMAGE_UPLOADS']

    if not post:
        abort(404)

    # 권한 확인: 관리자 또는 작성자 본인
    if not user.is_admin and post.author_id != user.id:
        flash("게시물을 수정할 권한이 없습니다.", "danger")
        return redirect(url_for('view_post', post_id=post_id))

    if request.method == 'POST':
        # 폼 데이터 가져오기
        title = request.form.get('title')
        content = request.form.get('content')
        category = request.form.get('category', post.category)
        is_notice = 'is_notice' in request.form
        expires_at_str = request.form.get('expires_at')
        # 삭제할 기존 이미지 파일명 리스트
        images_to_delete = request.form.getlist('delete_images')
        # 새로 업로드된 이미지 파일 리스트
        new_image_files = request.files.getlist('images')

        if not title or not content:
            flash('제목과 내용은 필수입니다.', 'danger')
            # 오류 시 현재 입력값 유지 (기존 이미지 포함)
            existing_images = post.image_filenames.split(',') if post.image_filenames else []
            return render_template('edit_post.html', post=post, user=user, categories=post_categories,
                                   title=title, content=content.replace('<br>', '\n'), category=category,
                                   is_notice=is_notice, expires_at=expires_at_str,
                                   existing_images=existing_images, config=app.config) # 기존 이미지 리스트 전달

        if category not in post_categories:
            flash('유효하지 않은 카테고리입니다.', 'warning')
            category = post.category # 기존 값으로 복원

        expires_at_dt = post.expires_at # 기존 값 유지

        # 기존 이미지 파일명 리스트 (처리 전)
        current_filenames = post.image_filenames.split(',') if post.image_filenames else []
        filenames_to_keep = []
        files_actually_deleted = [] # 실제 삭제된 파일 추적
        newly_uploaded_filenames = [] # 새로 업로드 성공한 파일 추적

        try:
            # 노출 기한 처리 (기존 유지)
            if expires_at_str:
                 try:
                    naive_dt = datetime.strptime(expires_at_str, '%Y-%m-%dT%H:%M')
                    kst_dt = KST.localize(naive_dt)
                    expires_at_dt = kst_dt.astimezone(pytz.utc)
                 except ValueError:
                    flash('노출 기한 형식이 잘못되었습니다.', 'warning')
                    existing_images = post.image_filenames.split(',') if post.image_filenames else []
                    return render_template('edit_post.html', post=post, user=user, categories=post_categories,
                                           title=title, content=content.replace('<br>', '\n'), category=category,
                                           is_notice=is_notice, expires_at=expires_at_str,
                                           existing_images=existing_images, config=app.config)
            else:
                 expires_at_dt = None # 빈 문자열이면 None으로 설정

            # --- 이미지 처리 ---
            # 1. 삭제될 기존 이미지 처리
            filenames_to_keep = [f for f in current_filenames if f not in images_to_delete]
            files_to_delete_physically = [f for f in current_filenames if f in images_to_delete]

            # 2. 새로 업로드된 유효한 파일 필터링
            # 실제로 파일이 선택된 것만 필터링
            actual_new_files = [f for f in new_image_files if f and f.filename != '']
            valid_new_files = [f for f in actual_new_files if allowed_file(f.filename)]

            # 실제 파일이 있고, 유효하지 않은 파일이 있는 경우에만 경고
            if actual_new_files and len(actual_new_files) > len(valid_new_files):
                 flash('허용되지 않는 파일 형식(png, jpg, jpeg, gif)이 포함되어 제외되었습니다.', 'warning')

            # 3. 총 이미지 개수 확인 (유지될 기존 이미지 + 새 이미지)
            total_images_after_upload = len(filenames_to_keep) + len(valid_new_files)
            if total_images_after_upload > MAX_UPLOADS:
                flash(f'이미지는 최대 {MAX_UPLOADS}개까지 첨부할 수 있습니다. (현재 {len(filenames_to_keep)}개 유지, {len(valid_new_files)}개 추가 시도)', 'warning')
                existing_images = post.image_filenames.split(',') if post.image_filenames else []
                return render_template('edit_post.html', post=post, user=user, categories=post_categories,
                                       title=title, content=content.replace('<br>', '\n'), category=category,
                                       is_notice=is_notice, expires_at=expires_at_str,
                                       existing_images=existing_images, config=app.config)

            # 4. 새 이미지 저장 및 파일명 추가
            for image_file in valid_new_files:
                filename = secure_filename(image_file.filename)
                timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
                unique_filename = f"{timestamp}_{user.id}_{filename}"
                save_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
                try:
                    image_file.save(save_path)
                    newly_uploaded_filenames.append(unique_filename)
                except Exception as save_e:
                     print(f"Error saving new file {filename}: {save_e}")
                     flash(f"새 이미지 '{filename}' 저장 중 오류 발생.", "danger")
                     # 롤백 처리 필요 (이미 저장된 새 파일 삭제)
                     for fname in newly_uploaded_filenames:
                         fpath = os.path.join(app.config['UPLOAD_FOLDER'], fname)
                         if os.path.exists(fpath): os.remove(fpath)
                     raise save_e # 오류 발생시켜 롤백 유도

            # 5. 최종 파일명 리스트 생성 및 문자열 변환
            final_filenames = filenames_to_keep + newly_uploaded_filenames
            image_filenames_str = ",".join(final_filenames) if final_filenames else None

            # 게시물 업데이트
            post.title = title
            post.content = content.replace('\n', '<br>')
            post.category = category
            post.is_notice = is_notice
            post.expires_at = expires_at_dt
            post.image_filenames = image_filenames_str # 업데이트된 파일명 문자열

            # 협력직원이 수정하면 승인 상태 해제 (기존 유지)
            if not user.is_admin:
                post.is_approved = False

            db.session.commit()

            # --- DB 업데이트 성공 후, 삭제하기로 한 기존 이미지 파일 물리적 삭제 ---
            for filename_to_delete in files_to_delete_physically:
                 try:
                     file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename_to_delete)
                     if os.path.exists(file_path):
                         os.remove(file_path)
                         files_actually_deleted.append(filename_to_delete)
                         print(f"Deleted old image file: {file_path}")
                 except Exception as img_del_e:
                     print(f"Error deleting old image file {filename_to_delete}: {img_del_e}")
                     # 파일 삭제 실패 시 로그만 남김 (DB는 이미 업데이트됨)

            flash('게시물이 성공적으로 수정되었습니다.' + (' 관리자 재승인 후 게시됩니다.' if not post.is_approved and not user.is_admin else ''), 'success')
            return redirect(url_for('view_post', post_id=post.id))

        except Exception as e:
            db.session.rollback()
            # 롤백 시 새로 저장했던 파일 삭제
            for fname in newly_uploaded_filenames:
                 fpath = os.path.join(app.config['UPLOAD_FOLDER'], fname)
                 if os.path.exists(fpath):
                     try: os.remove(fpath)
                     except: pass
            flash(f'게시물 수정 중 오류 발생: {e}', 'danger')
            print(f"Error editing post {post_id}: {e}")
            existing_images = post.image_filenames.split(',') if post.image_filenames else []
            # 오류 발생 시 다시 폼을 보여주되, 사용자가 입력한 값 유지
            return render_template('edit_post.html', post=post, user=user, categories=post_categories,
                                   title=title, content=content.replace('<br>', '\n'), category=category,
                                   is_notice=is_notice, expires_at=expires_at_str,
                                   existing_images=existing_images, config=app.config)


    # GET 요청 시: 폼에 기존 데이터 채워서 렌더링
    expires_at_kst_str = ""
    if post.expires_at:
        kst_expires = post.expires_at.replace(tzinfo=pytz.utc).astimezone(KST)
        expires_at_kst_str = kst_expires.strftime('%Y-%m-%dT%H:%M')

    # --- 기존 이미지 파일명 리스트 전달 ---
    existing_images = post.image_filenames.split(',') if post.image_filenames else []

    return render_template('edit_post.html', post=post, user=user, categories=post_categories,
                           title=post.title, content=post.content.replace('<br>', '\n'), # textarea는 \n 사용
                           category=post.category, is_notice=post.is_notice,
                           expires_at=expires_at_kst_str,
                           existing_images=existing_images, config=app.config) # 리스트 전달


# --- 업로드된 파일 제공 라우트 ---
@app.route('/uploads/<path:filename>')
def uploaded_file(filename):
    # ../ 등의 경로 탐색 방지
    safe_filename = secure_filename(filename)
    if not safe_filename:
        abort(404)
    return send_from_directory(app.config['UPLOAD_FOLDER'], safe_filename)

# --- 게시물 승인/삭제/표시여부 토글 API ---
@app.route('/post/<int:post_id>/approve', methods=['POST'])
@admin_required
def approve_post(post_id):
    post = db.session.get(Post, post_id)
    if not post:
        return jsonify({"status": "error", "message": "게시물을 찾을 수 없습니다."}), 404

    try:
        post.is_approved = True
        db.session.commit()
        return jsonify({"status": "success", "message": "게시물이 승인되었습니다."})
    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "message": f"승인 중 오류 발생: {e}"}), 500

@app.route('/post/<int:post_id>/delete', methods=['POST'])
@post_manager_required
def delete_post(post_id):
    from flask import g
    user = g.user

    post = db.session.get(Post, post_id)
    if not post:
        return jsonify({"status": "error", "message": "게시물을 찾을 수 없습니다."}), 404

    # 관리자가 아니면서 작성자 본인도 아니면 삭제 불가
    if not user.is_admin and post.author_id != user.id:
        return jsonify({"status": "error", "message": "삭제 권한이 없습니다."}), 403

    try:
        # --- 삭제할 이미지 파일명 리스트 가져오기 ---
        filenames_to_delete = post.image_filenames.split(',') if post.image_filenames else []

        db.session.delete(post)
        db.session.commit()

        # --- DB 삭제 성공 후 이미지 파일들 삭제 ---
        for filename in filenames_to_delete:
            try:
                image_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                if os.path.exists(image_path):
                    os.remove(image_path)
                    print(f"Deleted image file: {image_path}")
                else:
                    print(f"Image file not found (already deleted?): {image_path}")
            except Exception as img_e:
                # 이미지 삭제 실패는 로그만 남김 (DB는 이미 삭제됨)
                print(f"Error deleting image file {filename}: {img_e}")

        return jsonify({"status": "success", "message": "게시물이 삭제되었습니다."})
    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "message": f"삭제 중 오류 발생: {e}"}), 500

@app.route('/post/<int:post_id>/toggle_visibility', methods=['POST'])
@admin_required # 관리자만 가능
def toggle_post_visibility(post_id):
    post = db.session.get(Post, post_id)
    if not post:
        return jsonify({"status": "error", "message": "게시물을 찾을 수 없습니다."}), 404

    try:
        post.is_visible = not post.is_visible # 상태 토글
        db.session.commit()
        new_status = "표시됨" if post.is_visible else "숨김"
        return jsonify({
            "status": "success",
            "message": f"게시물 상태가 '{new_status}'(으)로 변경되었습니다.",
            "is_visible": post.is_visible
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "message": f"상태 변경 중 오류 발생: {e}"}), 500

# --- 알림 API 엔드포인트 ---
@app.route('/api/notifications')
@login_required # 알림은 로그인한 사용자만 받도록 함
def get_notifications():
    # 현재 시간을 UTC 기준으로 가져옴
    now_utc_naive = datetime.utcnow()

    try:
        # is_notice=True, is_approved=True, is_visible=True 이고 만료되지 않은 게시물
        notices_query = Post.query.filter(
            Post.is_notice == True,
            Post.is_approved == True,
            Post.is_visible == True,
            or_(Post.expires_at == None, Post.expires_at > now_utc_naive)
        ).order_by(desc(Post.created_at)).limit(5) # 예시: 최근 5개

        notices = notices_query.all()

        notice_list = [{
            "id": notice.id,
            "title": notice.title,
            "category": notice.category
         } for notice in notices]

        return jsonify({
            "status": "success",
            "notifications": notice_list,
            "count": len(notice_list)
        })
    except Exception as e:
        print(f"Error fetching notifications: {e}")
        return jsonify({"status": "error", "message": "알림 조회 중 오류 발생", "notifications": [], "count": 0}), 500

# --- Public API Endpoints ---
@app.route('/api/shuttle')
def get_shuttle():
    return jsonify(SHUTTLE_SCHEDULE_DATA)

@app.route('/api/meal')
def get_meal():
    cafeteria = request.args.get('cafeterIA', 'student') # 파라미터 이름 오타 대응
    if cafeteria in MEAL_PLAN_DATA:
        formatted_meal = format_meal_for_client(MEAL_PLAN_DATA[cafeteria], TODAY_MEAL_KEY, cafeteria)
        return jsonify(formatted_meal)
    return jsonify({"error": "Invalid cafeteria type"}), 400

@app.route('/api/meal/week')
def get_weekly_meal():
    formatted_data = format_weekly_meal_for_client(MEAL_PLAN_DATA)
    return jsonify(formatted_data)

# --- Secure API Endpoints ---
@app.route('/api/schedule', methods=['GET'])
@login_required
def get_schedule():
    from flask import g
    user_id = g.user.id

    today_kst = datetime.now(KST) # KST 기준
    today_str = today_kst.strftime('%Y-%m-%d')
    today_day_of_week = today_kst.weekday() + 1 # 1:월 ~ 7:일

    schedule_list = []

    try:
        # 1. 사용자가 직접 추가한 일정
        user_schedules = Schedule.query.filter_by(user_id=user_id, date=today_str).all()
        for s in user_schedules:
            schedule_list.append({"type": "schedule", "time": s.time, "title": s.title, "location": s.location})

        # 2. 오늘 요일의 시간표 (수업)
        current_semester = None
        all_semesters = Semester.query.filter_by(user_id=user_id).order_by(Semester.year.desc()).all()
        if all_semesters:
            current_found = False
            today_date_obj = today_kst.date()
            for s in all_semesters:
                start = s.start_date if s.start_date else _get_semester_start_date_fallback(s.year, s.season)
                if start and start <= today_date_obj and today_date_obj <= start + timedelta(weeks=16): # 16주로 가정
                    current_semester = s
                    current_found = True
                    break

            if not current_found and all_semesters:
                season_order = {"1학기": 1, "여름학기": 2, "2학기": 3, "겨울학기": 4}
                all_semesters.sort(key=lambda sem: (sem.year, season_order.get(sem.season, 99)), reverse=True)
                current_semester = all_semesters[0]

        if current_semester and 1 <= today_day_of_week <= 5:
            today_subjects = Subject.query.join(TimeSlot).filter(
                Subject.semester_id == current_semester.id
            ).filter(
                TimeSlot.day_of_week == today_day_of_week
            ).all()

            for subject in today_subjects:
                subject_timeslots_today = [ts for ts in subject.timeslots if ts.day_of_week == today_day_of_week]
                for ts in subject_timeslots_today:
                    schedule_list.append({
                        "type": "class",
                        "time": ts.start_time,
                        "title": subject.name,
                        "location": ts.room
                    })

        schedule_list.sort(key=lambda x: x['time'])
        return jsonify(schedule_list)

    except Exception as e:
        print(f"Error fetching schedule: {e}")
        return jsonify({"status": "error", "message": "일정 조회 중 오류 발생"}), 500

@app.route('/api/schedule/add', methods=['POST'])
@login_required
def add_schedule():
    from flask import g
    user_id = g.user.id
    data = request.json

    s_date = data.get('date')
    s_time = data.get('time')
    s_title = data.get('title')
    s_location = data.get('location')

    if not all([s_date, s_time, s_title]):
        return jsonify({"status": "error", "message": "날짜, 시간, 일정 내용은 필수입니다."}), 400

    try:
        datetime.strptime(s_date, '%Y-%m-%d')
        datetime.strptime(s_time, '%H:%M')
    except ValueError:
        return jsonify({"status": "error", "message": "날짜 또는 시간 형식이 잘못되었습니다."}), 400

    try:
        new_schedule = Schedule(
            user_id=user_id,
            date=s_date,
            time=s_time,
            title=s_title,
            location=s_location
        )
        db.session.add(new_schedule)
        db.session.commit()
        return jsonify({
            "status": "success",
            "message": "일정이 추가되었습니다.",
            "schedule": {
                "id": new_schedule.entry_id,
                "type": "schedule",
                "date": new_schedule.date,
                "time": new_schedule.time,
                "title": new_schedule.title,
                "location": new_schedule.location
            }
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "message": f"일정 추가 중 오류 발생: {e}"}), 500

@app.route('/api/semesters', methods=['GET'])
@login_required
def handle_semesters():
    from flask import g
    user_id = g.user.id
    try:
        semesters = Semester.query.filter_by(user_id=user_id).all()
        season_order = {"1학기": 1, "여름학기": 2, "2학기": 3, "겨울학기": 4}
        semesters.sort(key=lambda s: (s.year, season_order.get(s.season, 99)), reverse=True)
        return jsonify([{"id": s.id, "name": s.name} for s in semesters])
    except Exception as e:
        print(f"Error fetching semesters: {e}")
        return jsonify({"status": "error", "message": "학기 목록 조회 실패"}), 500

@app.route('/api/timetable-data', methods=['GET'])
@login_required
def get_timetable_data():
    from flask import g
    user_id = g.user.id
    semester_id_str = request.args.get('semester_id')
    semester = None

    try:
        if semester_id_str:
            try:
                semester = db.session.get(Semester, int(semester_id_str))
            except ValueError:
                semester = None
            if semester and semester.user_id != user_id:
                semester = None
        else:
            today_kst = datetime.now(KST).date() # KST 기준
            all_semesters = Semester.query.filter_by(user_id=user_id).order_by(Semester.year.desc()).all()
            if all_semesters:
                current_found = False
                for s in all_semesters:
                    start = s.start_date if s.start_date else _get_semester_start_date_fallback(s.year, s.season)
                    if start and start <= today_kst and today_kst <= start + timedelta(weeks=16):
                        semester = s
                        current_found = True
                        break
                if not current_found:
                    season_order = {"1학기": 1, "여름학기": 2, "2학기": 3, "겨울학기": 4}
                    all_semesters.sort(key=lambda s: (s.year, season_order.get(s.season, 99)), reverse=True)
                    semester = all_semesters[0]

        if not semester:
            all_semesters = Semester.query.filter_by(user_id=user_id).order_by(Semester.year.desc()).all()
            if all_semesters:
                season_order = {"1학기": 1, "여름학기": 2, "2학기": 3, "겨울학기": 4}
                all_semesters.sort(key=lambda s: (s.year, season_order.get(s.season, 99)), reverse=True)
                semester = all_semesters[0]
            else:
                return jsonify({"semester": None, "subjects": []}), 404

        subjects = Subject.query.filter_by(user_id=user_id, semester_id=semester.id).all()
        result = []
        for s in subjects:
            timeslots_data = [
                {"id": ts.id, "day": ts.day_of_week, "start": ts.start_time, "end": ts.end_time, "room": ts.room}
                for ts in s.timeslots
            ]

            memo_data = {}
            if s.memo:
                try:
                    memo_data = json.loads(s.memo)
                except (json.JSONDecodeError, TypeError):
                    memo_data = {"note": s.memo if isinstance(s.memo, str) else "", "todos": []}
            else:
                memo_data = {"note": "", "todos": []}

            result.append({
                "id": s.id,
                "name": s.name,
                "professor": s.professor,
                "credits": s.credits,
                "grade": s.grade,
                "timeslots": timeslots_data,
                "memo": memo_data
            })

        semester_info = {
            "id": semester.id,
            "name": semester.name,
            "year": semester.year,
            "season": semester.season,
            "start_date": semester.start_date.isoformat() if semester.start_date else None
        }
        return jsonify({"semester": semester_info, "subjects": result})

    except Exception as e:
        print(f"Error fetching timetable data: {e}")
        return jsonify({"status": "error", "message": "시간표 데이터 조회 실패"}), 500

@app.route('/api/subjects', methods=['POST'])
@login_required
def create_subject():
    from flask import g
    user_id = g.user.id
    data = request.json

    semester_id = data.get('semester_id')
    name = data.get('name')

    if not semester_id or not name:
        return jsonify({"status": "error", "message": "학기 ID와 과목명은 필수입니다."}), 400

    semester = db.session.get(Semester, semester_id)
    if not semester or semester.user_id != user_id:
        return jsonify({"status": "error", "message": "유효하지 않은 학기입니다."}), 404

    try:
        initial_memo = json.dumps({"note": "", "todos": []})

        new_subject = Subject(
            user_id=user_id,
            semester_id=semester_id,
            name=name,
            professor=data.get('professor'),
            credits=data.get('credits', 3),
            grade='Not Set',
            memo=initial_memo
        )
        db.session.add(new_subject)
        db.session.flush()

        for ts_data in data.get('timeslots', []):
            if ts_data.get('day') and ts_data.get('start') and ts_data.get('end'):
                db.session.add(TimeSlot(
                    subject_id=new_subject.id,
                    day_of_week=ts_data.get('day'),
                    start_time=ts_data.get('start'),
                    end_time=ts_data.get('end'),
                    room=ts_data.get('room')
                ))

        db.session.commit()

        all_user_subjects = Subject.query.filter_by(user_id=user_id).all()
        total_earned_credits = sum(s.credits for s in all_user_subjects)

        memo_data = json.loads(new_subject.memo)
        created_subject_data = {
            "id": new_subject.id,
            "name": new_subject.name,
            "professor": new_subject.professor,
            "credits": new_subject.credits,
            "grade": new_subject.grade,
            "timeslots": [
                {"id": ts.id, "day": ts.day_of_week, "start": ts.start_time, "end": ts.end_time, "room": ts.room}
                for ts in new_subject.timeslots
            ],
            "memo": memo_data
        }

        return jsonify({
            "status": "success",
            "message": "과목이 추가되었습니다.",
            "subject": created_subject_data,
            "total_earned_credits": total_earned_credits
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "message": f"과목 추가 중 오류 발생: {e}"}), 500

@app.route('/api/subjects/<int:subject_id>', methods=['PUT', 'DELETE'])
@login_required
def handle_subject(subject_id):
    from flask import g
    user_id = g.user.id

    subject = db.session.get(Subject, subject_id)
    if not subject or subject.user_id != user_id:
        return jsonify({"status": "error", "message": "과목을 찾을 수 없거나 권한이 없습니다."}), 404

    if request.method == 'PUT':
        data = request.json
        try:
            subject.name = data.get('name', subject.name)
            subject.professor = data.get('professor', subject.professor)
            subject.credits = data.get('credits', subject.credits)
            subject.grade = data.get('grade', subject.grade)

            memo_data = data.get('memo')
            if isinstance(memo_data, dict) and ('note' in memo_data or 'todos' in memo_data):
                subject.memo = json.dumps({
                    "note": memo_data.get('note', ''),
                    "todos": memo_data.get('todos', [])
                })
            elif isinstance(memo_data, str):
                subject.memo = json.dumps({"note": memo_data, "todos": []})

            TimeSlot.query.filter_by(subject_id=subject.id).delete()
            for ts_data in data.get('timeslots', []):
                if ts_data.get('day') and ts_data.get('start') and ts_data.get('end'):
                    db.session.add(TimeSlot(
                        subject_id=subject.id,
                        day_of_week=ts_data.get('day'),
                        start_time=ts_data.get('start'),
                        end_time=ts_data.get('end'),
                        room=ts_data.get('room')
                    ))

            db.session.commit()

            all_user_subjects = Subject.query.filter_by(user_id=user_id).all()
            total_earned_credits = sum(s.credits for s in all_user_subjects)

            memo_data_resp = json.loads(subject.memo)
            updated_subject_data = {
                "id": subject.id,
                "name": subject.name,
                "professor": subject.professor,
                "credits": subject.credits,
                "grade": subject.grade,
                "timeslots": [
                    {"id": ts.id, "day": ts.day_of_week, "start": ts.start_time, "end": ts.end_time, "room": ts.room}
                    for ts in subject.timeslots
                ],
                "memo": memo_data_resp
            }

            return jsonify({
                "status": "success",
                "message": "과목이 수정되었습니다.",
                "subject": updated_subject_data,
                "total_earned_credits": total_earned_credits
            })
        except Exception as e:
            db.session.rollback()
            return jsonify({"status": "error", "message": f"과목 수정 중 오류 발생: {e}"}), 500

    if request.method == 'DELETE':
        try:
            db.session.delete(subject)
            db.session.commit()

            all_user_subjects = Subject.query.filter_by(user_id=user_id).all()
            total_earned_credits = sum(s.credits for s in all_user_subjects)

            return jsonify({
                "status": "success",
                "message": "과목 및 관련 데이터가 삭제되었습니다.",
                "total_earned_credits": total_earned_credits
            })
        except Exception as e:
            db.session.rollback()
            return jsonify({"status": "error", "message": f"과목 삭제 중 오류 발생: {e}"}), 500

    return jsonify({"status": "error", "message": "허용되지 않는 메소드입니다."}), 405

# --- [신규] 과목별 메모/Todo API ---
# 과목의 특정 날짜 메모 조회
@app.route('/api/subjects/<int:subject_id>/memo/<string:date_str>', methods=['GET'])
@login_required
def get_daily_memo(subject_id, date_str):
    from flask import g
    user_id = g.user.id
    subject = db.session.get(Subject, subject_id)
    if not subject or subject.user_id != user_id:
        return jsonify({"status": "error", "message": "과목을 찾을 수 없거나 권한이 없습니다."}), 404

    try:
        # DB의 memo 필드 (JSON 문자열) 가져오기
        memo_json_str = subject.memo
        memo_data = {}
        if memo_json_str:
            try:
                memo_data = json.loads(memo_json_str)
            except json.JSONDecodeError:
                # 파싱 실패 시, 이전 문자열 형태 데이터 처리
                if isinstance(memo_json_str, str):
                    memo_data = {"note": memo_json_str, "todos": []}
                else:
                    memo_data = {"note": "", "todos": []}
        else:
             memo_data = {"note": "", "todos": []}

        # daily_memos 필드가 없을 경우 초기화
        if "daily_memos" not in memo_data or not isinstance(memo_data["daily_memos"], dict):
            memo_data["daily_memos"] = {}

        # 해당 날짜의 메모 반환
        daily_note = memo_data["daily_memos"].get(date_str, "")

        return jsonify({"status": "success", "note": daily_note})

    except Exception as e:
        print(f"Error fetching daily memo for subject {subject_id} on {date_str}: {e}")
        return jsonify({"status": "error", "message": "메모 조회 중 오류 발생"}), 500

# 과목의 특정 날짜 메모 업데이트
@app.route('/api/subjects/<int:subject_id>/memo/<string:date_str>', methods=['PUT'])
@login_required
def update_daily_memo(subject_id, date_str):
    from flask import g
    user_id = g.user.id
    subject = db.session.get(Subject, subject_id)
    if not subject or subject.user_id != user_id:
        return jsonify({"status": "error", "message": "과목을 찾을 수 없거나 권한이 없습니다."}), 404

    data = request.json
    new_note = data.get('note', '')

    try:
        # DB의 memo 필드 (JSON 문자열) 가져오기 및 파싱
        memo_json_str = subject.memo
        memo_data = {}
        if memo_json_str:
            try:
                memo_data = json.loads(memo_json_str)
            except json.JSONDecodeError:
                 if isinstance(memo_json_str, str):
                    memo_data = {"note": memo_json_str, "todos": []} # 기존 메모 유지
                 else:
                     memo_data = {"note": "", "todos": []}
        else:
             memo_data = {"note": "", "todos": []}

        # daily_memos 필드 초기화
        if "daily_memos" not in memo_data or not isinstance(memo_data["daily_memos"], dict):
            memo_data["daily_memos"] = {}

        # 해당 날짜 메모 업데이트
        memo_data["daily_memos"][date_str] = new_note.strip()

        # 업데이트된 memo 데이터를 다시 JSON 문자열로 변환하여 저장
        subject.memo = json.dumps(memo_data, ensure_ascii=False)
        db.session.commit()

        return jsonify({"status": "success", "message": "메모가 저장되었습니다."})

    except Exception as e:
        db.session.rollback()
        print(f"Error updating daily memo for subject {subject_id} on {date_str}: {e}")
        return jsonify({"status": "error", "message": "메모 저장 중 오류 발생"}), 500

# --- [신규] 학기별 주차 메모 API ---
@app.route('/api/semesters/<int:semester_id>/all-memos-by-week', methods=['GET'])
@login_required
def get_all_memos_by_week(semester_id):
    from flask import g
    user_id = g.user.id
    semester = db.session.get(Semester, semester_id)
    if not semester or semester.user_id != user_id:
        return jsonify({"status": "error", "message": "학기를 찾을 수 없거나 권한이 없습니다."}), 404

    try:
        start_date = semester.start_date if semester.start_date else _get_semester_start_date_fallback(semester.year, semester.season)
        subjects_in_semester = Subject.query.filter_by(semester_id=semester.id).all()

        weekly_memos_data = []

        # 16주차 반복
        for week_num in range(1, 17):
            week_start_date = start_date + timedelta(weeks=week_num - 1)
            week_end_date = week_start_date + timedelta(days=6)
            week_subjects_data = []

            for subject in subjects_in_semester:
                subject_memos_this_week = []
                memo_json_str = subject.memo
                memo_data = {}
                try:
                    memo_data = json.loads(memo_json_str or '{}')
                except:
                     memo_data = {} # 파싱 실패 시 빈 객체

                daily_memos = memo_data.get("daily_memos", {})

                # 해당 주차의 날짜 확인
                current_date = week_start_date
                while current_date <= week_end_date:
                    date_str = current_date.strftime('%Y-%m-%d')
                    if date_str in daily_memos and daily_memos[date_str].strip():
                        subject_memos_this_week.append({
                            "date": date_str,
                            "note": daily_memos[date_str].strip()
                        })
                    current_date += timedelta(days=1)

                if subject_memos_this_week:
                     subject_memos_this_week.sort(key=lambda x: x['date']) # 날짜순 정렬
                     week_subjects_data.append({
                         "subject_id": subject.id,
                         "subject_name": subject.name,
                         "memos": subject_memos_this_week
                     })

            # 해당 주차에 메모가 있는 과목이 있을 경우에만 추가
            if week_subjects_data:
                 weekly_memos_data.append({
                     "week_number": week_num,
                     "date_range": f"{week_start_date.strftime('%m.%d')}~{week_end_date.strftime('%m.%d')}",
                     "subjects": week_subjects_data
                 })

        return jsonify({"status": "success", "data": weekly_memos_data})

    except Exception as e:
        print(f"Error fetching all weekly memos for semester {semester_id}: {e}")
        return jsonify({"status": "error", "message": "주차별 메모 조회 중 오류 발생"}), 500

# --- 기타 API (GPA, 스터디 통계 등) ---
@app.route('/api/gpa-stats', methods=['GET'])
@login_required
def get_gpa_stats():
    from flask import g
    user_id = g.user.id

    try:
        semesters = Semester.query.filter_by(user_id=user_id).all()
        season_order = {"1학기": 1, "여름학기": 2, "2학기": 3, "겨울학기": 4}
        semesters.sort(key=lambda s: (s.year, season_order.get(s.season, 99)))

        stats = []
        GRADE_MAP = {
            "A+": 4.5, "A0": 4.0, "B+": 3.5, "B0": 3.0,
            "C+": 2.5, "C0": 2.0, "D+": 1.5, "D0": 1.0, "F": 0.0
        }

        for semester in semesters:
            subjects = semester.subjects
            semester_gpa_credits = 0
            semester_gpa_score = 0
            for subject in subjects:
                grade_score = GRADE_MAP.get(subject.grade)
                if grade_score is not None:
                    semester_gpa_credits += subject.credits
                    semester_gpa_score += (grade_score * subject.credits)

            if semester_gpa_credits > 0:
                semester_gpa = (semester_gpa_score / semester_gpa_credits)
                stats.append({"semester_name": semester.name, "gpa": round(semester_gpa, 2)})

        all_subjects = Subject.query.filter_by(user_id=user_id).all()
        total_earned_credits = sum(s.credits for s in all_subjects)

        total_gpa_credits = 0
        total_gpa_score = 0
        for subject in all_subjects:
            grade_score = GRADE_MAP.get(subject.grade)
            if grade_score is not None:
                total_gpa_credits += subject.credits
                total_gpa_score += (grade_score * subject.credits)

        overall_gpa = (total_gpa_score / total_gpa_credits) if total_gpa_credits > 0 else 0.0

        return jsonify({
            "semesters": stats,
            "overall_gpa": round(overall_gpa, 2),
            "total_earned_credits": total_earned_credits
        })
    except Exception as e:
        print(f"Error fetching gpa stats: {e}")
        return jsonify({"status": "error", "message": "GPA 통계 조회 실패"}), 500

@app.route('/api/study-stats', methods=['GET'])
@login_required
def get_study_stats():
    from flask import g
    user_id = g.user.id
    try:
        today_kst = datetime.now(KST).date() # KST 기준
        today_str = today_kst.strftime('%Y-%m-%d')

        today_log = StudyLog.query.filter_by(user_id=user_id, date=today_str).first()
        today_seconds = today_log.duration_seconds if today_log else 0

        seven_days_ago_kst = today_kst - timedelta(days=6)
        seven_days_ago_str = seven_days_ago_kst.strftime('%Y-%m-%d')

        weekly_logs = StudyLog.query.filter(
            StudyLog.user_id == user_id,
            StudyLog.date >= seven_days_ago_str,
            StudyLog.date <= today_str
        ).all()

        total_seconds = sum(log.duration_seconds for log in weekly_logs)
        weekly_avg_seconds = total_seconds / 7 if total_seconds > 0 else 0

        return jsonify({"today": today_seconds, "weekly_avg": weekly_avg_seconds})
    except Exception as e:
        print(f"Error fetching study stats: {e}")
        return jsonify({"status": "error", "message": "공부 통계 조회 실패"}), 500


@app.route('/api/study-time', methods=['POST'])
@login_required
def save_study_time():
    data = request.json
    duration_to_add = data.get('duration_to_add')
    date_str = data.get('date') # YYYY-MM-DD (KST 기준 날짜)
    from flask import g
    user_id = g.user.id

    if not isinstance(duration_to_add, int) or duration_to_add < 0 or not date_str:
        return jsonify({"status": "error", "message": "잘못된 요청입니다."}), 400

    try:
        datetime.strptime(date_str, '%Y-%m-%d') # 날짜 형식 검증 (KST 기준)

        log_entry = StudyLog.query.filter_by(user_id=user_id, date=date_str).first()

        if log_entry:
            log_entry.duration_seconds += duration_to_add
        else:
            log_entry = StudyLog(user_id=user_id, date=date_str, duration_seconds=duration_to_add)
            db.session.add(log_entry)

        db.session.commit()
        return jsonify({"status": "success", "data": {"total_duration": log_entry.duration_seconds}})

    except ValueError:
        return jsonify({"status": "error", "message": "잘못된 날짜 형식입니다."}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "message": f"공부 시간 저장 중 오류 발생: {e}"}), 500

@app.route('/api/credits/goal', methods=['POST'])
@login_required
def update_credit_goal():
    data = request.json
    new_goal = data.get('goal', type=int)
    from flask import g
    user_id = g.user.id

    if new_goal is None or new_goal <= 0:
        return jsonify({"status": "error", "message": "유효하지 않은 학점입니다."}), 400

    try:
        user = db.session.get(User, user_id)
        if not user:
            return jsonify({"status": "error", "message": "사용자를 찾을 수 없습니다."}), 404

        user.total_credits_goal = new_goal
        db.session.commit()
        return jsonify({"status": "success", "message": "목표 학점이 업데이트되었습니다.", "new_goal": new_goal})
    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "message": f"업데이트 중 오류 발생: {e}"}), 500

# --- 캘린더 관련 엔드포인트 ---
@app.route('/calendar')
@login_required
def calendar_page():
    """캘린더 페이지"""
    from flask import g
    user = g.user
    return render_template('calendar.html', user=user)

@app.route('/api/calendar/categories', methods=['GET'])
@login_required
def get_calendar_categories():
    """사용자의 카테고리 조회 (시스템 카테고리 포함)"""
    from flask import g
    user_id = g.user.id

    try:
        # 시스템 카테고리 + 사용자 카테고리
        categories = CalendarCategory.query.filter(
            or_(CalendarCategory.user_id == user_id, CalendarCategory.is_system == True)
        ).all()

        return jsonify({
            'status': 'success',
            'categories': [cat.to_dict() for cat in categories]
        })
    except Exception as e:
        print(f"Error fetching categories: {e}")
        return jsonify({'status': 'error', 'message': '카테고리 조회 중 오류 발생'}), 500

@app.route('/api/calendar/categories', methods=['POST'])
@login_required
def create_calendar_category():
    """새 카테고리 생성"""
    from flask import g
    user_id = g.user.id
    data = request.get_json()

    if not data or 'name' not in data or 'color' not in data:
        return jsonify({'status': 'error', 'message': '카테고리 이름과 색상이 필요합니다.'}), 400

    try:
        name = data['name'].strip()
        color = data['color'].strip()

        if not name:
            return jsonify({'status': 'error', 'message': '카테고리 이름이 없습니다.'}), 400

        # 중복 체크
        existing = CalendarCategory.query.filter_by(user_id=user_id, name=name).first()
        if existing:
            return jsonify({'status': 'error', 'message': '이미 존재하는 카테고리입니다.'}), 400

        new_category = CalendarCategory(
            user_id=user_id,
            name=name,
            color=color,
            is_system=False
        )
        db.session.add(new_category)
        db.session.commit()

        return jsonify({'status': 'success', 'category': new_category.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        print(f"Error creating category: {e}")
        return jsonify({'status': 'error', 'message': '카테고리 생성 중 오류 발생'}), 500

@app.route('/api/calendar/categories/<int:category_id>', methods=['PUT'])
@login_required
def update_calendar_category(category_id):
    """카테고리 수정"""
    from flask import g
    user_id = g.user.id
    data = request.get_json()

    try:
        category = db.session.get(CalendarCategory, category_id)
        if not category or category.user_id != user_id:
            return jsonify({'status': 'error', 'message': '카테고리를 찾을 수 없습니다.'}), 404

        if category.is_system:
            return jsonify({'status': 'error', 'message': '시스템 카테고리는 수정할 수 없습니다.'}), 403

        if 'name' in data:
            category.name = data['name'].strip()
        if 'color' in data:
            category.color = data['color'].strip()

        db.session.commit()
        return jsonify({'status': 'success', 'category': category.to_dict()})
    except Exception as e:
        db.session.rollback()
        print(f"Error updating category: {e}")
        return jsonify({'status': 'error', 'message': '카테고리 수정 중 오류 발생'}), 500

@app.route('/api/calendar/categories/<int:category_id>', methods=['DELETE'])
@login_required
def delete_calendar_category(category_id):
    """카테고리 삭제"""
    from flask import g
    user_id = g.user.id

    try:
        category = db.session.get(CalendarCategory, category_id)
        if not category or category.user_id != user_id:
            return jsonify({'status': 'error', 'message': '카테고리를 찾을 수 없습니다.'}), 404

        if category.is_system:
            return jsonify({'status': 'error', 'message': '시스템 카테고리는 삭제할 수 없습니다.'}), 403

        db.session.delete(category)
        db.session.commit()
        return jsonify({'status': 'success', 'message': '카테고리가 삭제되었습니다.'})
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting category: {e}")
        return jsonify({'status': 'error', 'message': '카테고리 삭제 중 오류 발생'}), 500

@app.route('/api/calendar/events', methods=['GET'])
@login_required
def get_calendar_events():
    """이벤트 조회 (시스템 이벤트 + 사용자 이벤트)"""
    from flask import g
    user_id = g.user.id
    start_date_str = request.args.get('start')
    end_date_str = request.args.get('end')

    try:
        query = CalendarEvent.query.filter(
            or_(CalendarEvent.user_id == user_id, CalendarEvent.is_system == True)
        )

        # 날짜 범위 필터링 (선택적)
        if start_date_str:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
            query = query.filter(CalendarEvent.start_date >= start_date)

        if end_date_str:
            end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()
            query = query.filter(CalendarEvent.start_date <= end_date)

        events = query.all()

        return jsonify({
            'status': 'success',
            'events': [event.to_dict() for event in events]
        })
    except Exception as e:
        print(f"Error fetching events: {e}")
        return jsonify({'status': 'error', 'message': '이벤트 조회 중 오류 발생'}), 500

@app.route('/api/calendar/events', methods=['POST'])
@login_required
def create_calendar_event():
    """새 이벤트 생성"""
    from flask import g
    user_id = g.user.id
    data = request.get_json()

    if not data or 'title' not in data or 'start_date' not in data or 'category_id' not in data:
        return jsonify({'status': 'error', 'message': '필수 데이터 누락'}), 400

    try:
        title = data['title'].strip()
        start_date = datetime.strptime(data['start_date'], '%Y-%m-%d').date()
        category_id = int(data['category_id'])

        # 카테고리 유효성 검사
        category = db.session.get(CalendarCategory, category_id)
        if not category or (category.user_id != user_id and not category.is_system):
            return jsonify({'status': 'error', 'message': '유효하지 않은 카테고리입니다.'}), 404

        # 종료 날짜
        end_date = None
        if 'end_date' in data and data['end_date']:
            end_date = datetime.strptime(data['end_date'], '%Y-%m-%d').date()

        # 시간
        start_time = None
        end_time = None
        all_day = data.get('all_day', True)

        if not all_day:
            if 'start_time' in data and data['start_time']:
                start_time = datetime.strptime(data['start_time'], '%H:%M').time()
            if 'end_time' in data and data['end_time']:
                end_time = datetime.strptime(data['end_time'], '%H:%M').time()

        # 반복 일정
        recurrence_type = data.get('recurrence_type', None)
        recurrence_end_date = None
        if recurrence_type and 'recurrence_end_date' in data and data['recurrence_end_date']:
            recurrence_end_date = datetime.strptime(data['recurrence_end_date'], '%Y-%m-%d').date()

        new_event = CalendarEvent(
            user_id=user_id,
            category_id=category_id,
            title=title,
            description=data.get('description', ''),
            start_date=start_date,
            end_date=end_date,
            start_time=start_time,
            end_time=end_time,
            all_day=all_day,
            is_system=False,
            recurrence_type=recurrence_type,
            recurrence_end_date=recurrence_end_date,
            recurrence_interval=data.get('recurrence_interval', 1)
        )
        db.session.add(new_event)
        db.session.commit()

        return jsonify({'status': 'success', 'event': new_event.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        print(f"Error creating event: {e}")
        return jsonify({'status': 'error', 'message': f'이벤트 생성 중 오류 발생: {str(e)}'}), 500

@app.route('/api/calendar/events/<int:event_id>', methods=['PUT'])
@login_required
def update_calendar_event(event_id):
    """이벤트 수정 (드래그 앤 드롭 포함)"""
    from flask import g
    user_id = g.user.id
    data = request.get_json()

    try:
        event = db.session.get(CalendarEvent, event_id)
        if not event or event.user_id != user_id:
            return jsonify({'status': 'error', 'message': '이벤트를 찾을 수 없습니다.'}), 404

        if event.is_system:
            return jsonify({'status': 'error', 'message': '시스템 이벤트는 수정할 수 없습니다.'}), 403

        # 업데이트
        if 'title' in data:
            event.title = data['title'].strip()
        if 'description' in data:
            event.description = data['description']
        if 'start_date' in data:
            event.start_date = datetime.strptime(data['start_date'], '%Y-%m-%d').date()
        if 'end_date' in data:
            if data['end_date']:
                event.end_date = datetime.strptime(data['end_date'], '%Y-%m-%d').date()
            else:
                event.end_date = None
        if 'start_time' in data:
            if data['start_time']:
                event.start_time = datetime.strptime(data['start_time'], '%H:%M').time()
            else:
                event.start_time = None
        if 'end_time' in data:
            if data['end_time']:
                event.end_time = datetime.strptime(data['end_time'], '%H:%M').time()
            else:
                event.end_time = None
        if 'all_day' in data:
            event.all_day = bool(data['all_day'])
        if 'category_id' in data:
            category_id = int(data['category_id'])
            category = db.session.get(CalendarCategory, category_id)
            if category and (category.user_id == user_id or category.is_system):
                event.category_id = category_id

        # 반복 일정 업데이트
        if 'recurrence_type' in data:
            event.recurrence_type = data['recurrence_type'] if data['recurrence_type'] else None
        if 'recurrence_end_date' in data:
            if data['recurrence_end_date']:
                event.recurrence_end_date = datetime.strptime(data['recurrence_end_date'], '%Y-%m-%d').date()
            else:
                event.recurrence_end_date = None
        if 'recurrence_interval' in data:
            event.recurrence_interval = int(data['recurrence_interval']) if data['recurrence_interval'] else 1

        db.session.commit()
        return jsonify({'status': 'success', 'event': event.to_dict()})
    except Exception as e:
        db.session.rollback()
        print(f"Error updating event: {e}")
        return jsonify({'status': 'error', 'message': f'이벤트 수정 중 오류 발생: {str(e)}'}), 500

@app.route('/api/calendar/events/<int:event_id>', methods=['DELETE'])
@login_required
def delete_calendar_event(event_id):
    """이벤트 삭제"""
    from flask import g
    user_id = g.user.id

    try:
        event = db.session.get(CalendarEvent, event_id)
        if not event or event.user_id != user_id:
            return jsonify({'status': 'error', 'message': '이벤트를 찾을 수 없습니다.'}), 404

        if event.is_system:
            return jsonify({'status': 'error', 'message': '시스템 이벤트는 삭제할 수 없습니다.'}), 403

        db.session.delete(event)
        db.session.commit()
        return jsonify({'status': 'success', 'message': '이벤트가 삭제되었습니다.'})
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting event: {e}")
        return jsonify({'status': 'error', 'message': '이벤트 삭제 중 오류 발생'}), 500

@app.route('/api/todos', methods=['GET'])
@login_required
def get_todos():
    from flask import g
    user_id = g.user.id
    semester_id = request.args.get('semester_id', type=int)
    start_date_str = request.args.get('start_date')
    end_date_str = request.args.get('end_date')

    if not semester_id or not start_date_str or not end_date_str:
        return jsonify({'status': 'error', 'message': '학기 ID와 날짜 범위가 필요합니다.'}), 400

    try:
        start_date_obj = datetime.strptime(start_date_str, '%Y-%m-%d').date()
        end_date_obj = datetime.strptime(end_date_str, '%Y-%m-%d').date()

        todos = Todo.query.filter(
            Todo.user_id == user_id,
            Todo.semester_id == semester_id,
            Todo.due_date >= start_date_obj,
            Todo.due_date <= end_date_obj
        ).order_by(Todo.due_date, Todo.created_at).all()

        return jsonify({'status': 'success', 'todos': [todo.to_dict() for todo in todos]})
    except ValueError:
        return jsonify({'status': 'error', 'message': '날짜 형식이 올바르지 않습니다.'}), 400
    except Exception as e:
        print(f"Error fetching todos: {e}")
        return jsonify({'status': 'error', 'message': 'Todo 조회 중 오류 발생'}), 500

@app.route('/api/todos', methods=['POST'])
@login_required
def create_todo():
    from flask import g
    user_id = g.user.id
    data = request.get_json()

    if not data or 'task' not in data or 'due_date' not in data or 'semester_id' not in data:
        return jsonify({'status': 'error', 'message': '필수 데이터 누락'}), 400

    try:
        due_date_obj = datetime.strptime(data['due_date'], '%Y-%m-%d').date()
        semester_id = int(data['semester_id'])
        task = data['task'].strip()

        if not task:
            return jsonify({'status': 'error', 'message': 'Todo 내용이 없습니다.'}), 400

        semester = db.session.get(Semester, semester_id)
        if not semester or semester.user_id != user_id:
            return jsonify({'status': 'error', 'message': '유효하지 않은 학기입니다.'}), 404

        new_todo = Todo(
            user_id=user_id,
            semester_id=semester_id,
            task=task,
            due_date=due_date_obj
        )
        db.session.add(new_todo)
        db.session.commit()
        return jsonify({'status': 'success', 'todo': new_todo.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/todos/<int:todo_id>', methods=['PUT', 'DELETE'])
@login_required
def manage_todo(todo_id):
    from flask import g
    user_id = g.user.id

    todo = db.session.get(Todo, todo_id)
    if not todo or todo.user_id != user_id:
        return jsonify({'status': 'error', 'message': 'Todo를 찾을 수 없습니다.'}), 404

    try:
        if request.method == 'PUT':
            data = request.get_json()
            if 'done' in data:
                todo.done = bool(data['done'])
            db.session.commit()
            return jsonify({'status': 'success', 'todo': todo.to_dict()})

        elif request.method == 'DELETE':
            db.session.delete(todo)
            db.session.commit()
            return jsonify({'status': 'success', 'message': 'Todo가 삭제되었습니다.'})

    except Exception as e:
        db.session.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500

# --- 앱 실행 부분 ---
if __name__ == '__main__':
    with app.app_context():
        try:
            print("--- [KUSIS] Checking database and initial data... ---")
            create_initial_data()
            print("--- [KUSIS] Database check and migration complete. System ready. ---")
        except Exception as e:
            print(f"--- [KUSIS] CRITICAL: Error during DB check/initialization: {e} ---")
            print("--- [KUSIS] Please check your .env file and ensure the database server is running. ---")

    # APScheduler 설정
    scheduler = BackgroundScheduler(timezone='Asia/Seoul')
    # 매일 자정(KST)에 학기 관리 작업 실행
    # scheduler.add_job(lambda: manage_semesters_job(app), 'cron', month=12, day=1, hour=3, id='semester_management_job')

    # 테스트용: 10시간마다 실행
    scheduler.add_job(lambda: manage_semesters_job(app), 'interval', minutes=600, id='semester_management_job_test')

    try:
        scheduler.start()
        print("Scheduler started... Press Ctrl+C to exit")
        # 앱 종료 시 스케줄러 종료 등록
        atexit.register(lambda: scheduler.shutdown())
    except Exception as e:
        print(f"Error starting scheduler: {e}")


    port = int(os.environ.get("PORT", 2424))
    # debug=True는 FLASK_DEBUG=True 환경 변수로 제어
    app.run(debug=os.environ.get("FLASK_DEBUG", "False").lower() == "true", host='0.0.0.0', port=port)