# app.py
from flask import Flask, render_template, jsonify, request, redirect, url_for, session, flash, abort, send_from_directory
from datetime import datetime, timedelta, date
import json
import csv
import os
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from flask_sqlalchemy import SQLAlchemy
import urllib.parse
from dotenv import load_dotenv
from apscheduler.schedulers.background import BackgroundScheduler
import atexit
from sqlalchemy import inspect, func, text, desc, or_
import pytz

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

# URL-encode the password
ENCODED_PASSWORD = urllib.parse.quote_plus(DB_PASSWORD)
app.config['SQLALCHEMY_DATABASE_URI'] = f'postgresql://{DB_USER}:{ENCODED_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# --- 파일 업로드 설정 ---
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'static', 'uploads')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
MAX_IMAGE_UPLOADS = 3

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_IMAGE_UPLOADS'] = MAX_IMAGE_UPLOADS

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

db = SQLAlchemy(app)

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


# --- File Paths ---
BASE_DIR = os.path.dirname(__file__)
BUS_TIME_PATH = os.path.join(BASE_DIR, 'schedules', 'bus_time.csv')
STUDENT_MENU_PATH = os.path.join(BASE_DIR, 'menu_data', 'student_menu.json')
STAFF_MENU_PATH = os.path.join(BASE_DIR, 'menu_data', 'staff_menu.json')
CALENDAR_PATH = os.path.join(BASE_DIR, 'schedules', 'Calendar.csv')

# --- Constants ---
SEASONS = ["1학기", "여름학기", "2학기", "겨울학기"]
SEASON_ORDER = {"1학기": 1, "여름학기": 2, "2학기": 3, "겨울학기": 4}
SEMESTER_YEAR_RANGE = (2020, 2025)

PERMISSIONS = ['general', 'associate', 'admin']
PERMISSION_MAP = {'general': '일반회원', 'associate': '협력회원', 'admin': '관리자'}

POST_CATEGORIES = ['공지', '홍보', '안내', '업데이트', '일반']

GRADE_MAP = {
    "A+": 4.5, "A0": 4.0, "B+": 3.5, "B0": 3.0,
    "C+": 2.5, "C0": 2.0, "D+": 1.5, "D0": 1.0, "F": 0.0
}

DEFAULT_TOTAL_CREDITS = 130

COLLEGES = {
    "과학기술대학": ["응용수리과학부 데이터계산과학전공", "인공지능사이버보안학과", "컴퓨터융합소프트웨어학과", "전자및정보공학과", "전자기계융합공학과", "환경시스템공학과", "지능형반도체공학과", "반도체물리학부", "생명정보공학과", "신소재화학과", "식품생명공학과", "미래모빌리티학과", "디지털헬스케어공학과", "자유공학부"],
    "글로벌비즈니스대학": ["글로벌학부 한국학전공", "글로벌학부 중국학전공", "글로벌학부 영미학전공", "글로벌학부 독일학전공", "융합경영학부 글로벌경영전공", "융합경영학부 디지털경영전공", "표준지식학과"],
    "공공정책대학": ["정부행정학부", "공공사회통일외교학부 공공사회학전공", "공공사회통일외교학부 통일외교안보전공", "경제통계학부 경제정책학전공", "빅데이터사이언스학부"],
    "문화스포츠대학": ["국제스포츠학부 스포츠과학전공", "국제스포츠학부 스포츠비즈니스전공", "문화유산융합학부", "문화창의학부 미디어문예창작전공", "문화창의학부 문화콘텐츠전공"],
    "약학대학": ["약학과", "첨단융합신약학과"],
    "스마트도시학부": ["스마트도시학부"]
}

# --- Database Models ---

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.String(10), primary_key=True)
    name = db.Column(db.String(50), nullable=False)
    dob = db.Column(db.String(10), nullable=False)
    college = db.Column(db.String(100), nullable=False)
    department = db.Column(db.String(100), nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    permission = db.Column(db.String(20), default='general', nullable=False)
    total_credits_goal = db.Column(db.Integer, default=DEFAULT_TOTAL_CREDITS, nullable=False)

    semesters = db.relationship('Semester', backref='user', lazy=True, cascade="all, delete-orphan")
    subjects = db.relationship('Subject', backref='user', lazy=True, cascade="all, delete-orphan")
    schedules = db.relationship('Schedule', backref='user', lazy=True, cascade="all, delete-orphan")
    study_logs = db.relationship('StudyLog', backref='user', lazy=True, cascade="all, delete-orphan")
    todos = db.relationship('Todo', backref='user', lazy=True, cascade="all, delete-orphan")
    posts = db.relationship('Post', backref='author', lazy=True, cascade="all, delete-orphan")

    @property
    def is_admin(self):
        return self.permission == 'admin'

    @property
    def is_associate(self):
        return self.permission == 'associate'

    @property
    def can_manage_posts(self):
        return self.is_admin or self.is_associate

class Semester(db.Model):
    __tablename__ = 'semesters'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(10), db.ForeignKey('users.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    year = db.Column(db.Integer, nullable=False)
    season = db.Column(db.String(50), nullable=False)
    start_date = db.Column(db.Date)
    subjects = db.relationship('Subject', backref='semester', lazy=True, cascade="all, delete-orphan")
    todos = db.relationship('Todo', backref='semester', lazy=True, cascade="all, delete-orphan")
    __table_args__ = (db.UniqueConstraint('user_id', 'name', name='_user_semester_name_uc'),)


class Subject(db.Model):
    __tablename__ = 'subjects'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(10), db.ForeignKey('users.id'), nullable=False)
    semester_id = db.Column(db.Integer, db.ForeignKey('semesters.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    professor = db.Column(db.String(50))
    credits = db.Column(db.Integer, default=3, nullable=False)
    grade = db.Column(db.String(10), default='Not Set')
    memo = db.Column(db.Text, default='{"note": "", "todos": []}')
    timeslots = db.relationship('TimeSlot', backref='subject', lazy=True, cascade="all, delete-orphan")


class TimeSlot(db.Model):
    __tablename__ = 'timeslots'
    id = db.Column(db.Integer, primary_key=True)
    subject_id = db.Column(db.Integer, db.ForeignKey('subjects.id'), nullable=False)
    day_of_week = db.Column(db.Integer, nullable=False)
    start_time = db.Column(db.String(5), nullable=False)
    end_time = db.Column(db.String(5), nullable=False)
    room = db.Column(db.String(50))


class Schedule(db.Model):
    __tablename__ = 'schedules'
    entry_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(10), db.ForeignKey('users.id'), nullable=False)
    date = db.Column(db.String(10), nullable=False)
    time = db.Column(db.String(5), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    location = db.Column(db.String(100))

class StudyLog(db.Model):
    __tablename__ = 'study_logs'
    entry_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(10), db.ForeignKey('users.id'), nullable=False)
    date = db.Column(db.String(10), nullable=False, index=True)
    duration_seconds = db.Column(db.Integer, default=0, nullable=False)
    __table_args__ = (db.UniqueConstraint('user_id', 'date', name='_user_date_uc'),)

class Todo(db.Model):
    __tablename__ = 'todos'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(10), db.ForeignKey('users.id'), nullable=False)
    semester_id = db.Column(db.Integer, db.ForeignKey('semesters.id'), nullable=False)
    task = db.Column(db.String(500), nullable=False)
    done = db.Column(db.Boolean, default=False, nullable=False)
    due_date = db.Column(db.Date, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'task': self.task,
            'done': self.done,
            'due_date': self.due_date.isoformat(),
            'semester_id': self.semester_id
        }

class Post(db.Model):
    __tablename__ = 'posts'
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, nullable=False)
    author_id = db.Column(db.String(10), db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    is_approved = db.Column(db.Boolean, default=False, nullable=False)
    is_notice = db.Column(db.Boolean, default=False, nullable=False)
    image_filenames = db.Column(db.Text, nullable=True)
    category = db.Column(db.String(50), nullable=True, default='일반')
    expires_at = db.Column(db.DateTime, nullable=True)
    is_visible = db.Column(db.Boolean, default=True, nullable=False)

    def to_dict(self, include_content=False):
        image_list = self.image_filenames.split(',') if self.image_filenames else []
        data = {
            'id': self.id,
            'title': self.title,
            'author_name': self.author.name if self.author else 'Unknown',
            'created_at': self.created_at.isoformat(),
            'is_approved': self.is_approved,
            'is_notice': self.is_notice,
            'image_filenames': image_list,
            'category': self.category,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'is_visible': self.is_visible
        }
        if include_content:
            data['content'] = self.content
            data['author_id'] = self.author_id
        return data

# --- 학사일정, 학기 시작일 관련 함수 ---
def load_academic_calendar():
    calendar_data = {}
    try:
        with open(CALENDAR_PATH, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            for row in reader:
                if len(row) >= 4:
                    year, month, day, event_name = row[0:4]
                    try:
                        event_date = date(int(year), int(month), int(day))
                        if "개강" in event_name:
                            semester_key = f"{year}-{month.zfill(2)}"
                            if semester_key not in calendar_data or event_date < calendar_data[semester_key]:
                                calendar_data[semester_key] = event_date
                    except ValueError:
                        continue
    except Exception as e:
        print(f"Error loading academic calendar: {e}")
    return calendar_data

ACADEMIC_CALENDAR = load_academic_calendar()

def get_semester_start_date_from_calendar(year, season):
    month_key = ""
    if "1학기" in season:
        month_key = f"{year}-03"
    elif "2학기" in season:
        month_key = f"{year}-09"
    elif "여름학기" in season:
        month_key = f"{year}-06"
    elif "겨울학기" in season:
        month_key = f"{year}-12"

    start_date = ACADEMIC_CALENDAR.get(month_key)
    return start_date if start_date else _get_semester_start_date_fallback(year, season)

def _get_semester_start_date_fallback(year, season):
    if "1학기" in season:
        return date(year, 3, 1)
    elif "2학기" in season:
        return date(year, 9, 1)
    elif "여름학기" in season:
        return date(year, 6, 20)
    elif "겨울학기" in season:
        return date(year, 12, 20)
    return date(year, 1, 1)

def sort_semesters(semesters, reverse=True):
    """학기 리스트를 연도와 계절 순서로 정렬"""
    return sorted(semesters, key=lambda s: (s.year, SEASON_ORDER.get(s.season, 99)), reverse=reverse)

def calculate_gpa(subjects):
    """과목 리스트에서 GPA 계산"""
    total_credits = 0
    total_score = 0
    earned_credits = sum(s.credits for s in subjects)

    for subject in subjects:
        grade_score = GRADE_MAP.get(subject.grade)
        if grade_score is not None:
            total_credits += subject.credits
            total_score += (grade_score * subject.credits)

    gpa = (total_score / total_credits) if total_credits > 0 else 0.0
    return {
        'gpa': round(gpa, 2),
        'total_credits': total_credits,
        'earned_credits': earned_credits
    }

def _create_semesters_for_user(user_id):
    try:
        start_year, end_year = SEMESTER_YEAR_RANGE
        for year in range(start_year, end_year + 1):
            for season in SEASONS:
                semester_name = f"{year}년 {season}"
                existing_semester = Semester.query.filter_by(user_id=user_id, name=semester_name).first()
                if not existing_semester:
                    start_date = get_semester_start_date_from_calendar(year, season)
                    new_semester = Semester(user_id=user_id, name=semester_name, year=year, season=season, start_date=start_date)
                    db.session.add(new_semester)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"Error creating semesters for user {user_id}: {e}")

def manage_semesters_job():
    """매년 12월 1일에 다음 년도 학기 데이터 자동 생성"""
    with app.app_context():
        print(f"[{datetime.now()}] Starting semester management job...")
        try:
            today = date.today()
            if today.month == 12 and today.day == 1:
                next_year = today.year + 1
                users = User.query.all()
                for user in users:
                    semester_name_check = f"{next_year}년 1학기"
                    exists = Semester.query.filter_by(user_id=user.id, name=semester_name_check).first()
                    if not exists:
                        print(f"Generating future semesters ({next_year}) for user {user.id}...")
                        for season in SEASONS:
                            semester_name = f"{next_year}년 {season}"
                            start_date = get_semester_start_date_from_calendar(next_year, season)
                            new_semester = Semester(user_id=user.id, name=semester_name, year=next_year, season=season, start_date=start_date)
                            db.session.add(new_semester)

            db.session.commit()
            print(f"[{datetime.now()}] Semester management job finished.")
        except Exception as e:
            db.session.rollback()
            print(f"[{datetime.now()}] ERROR in semester management job: {e}")

# --- DB 초기화 ---
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
            _create_semesters_for_user(sample_user_id)

        if db.session.get(User, admin_id):
            _create_semesters_for_user(admin_id)

        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"Error creating initial data: {e}")


# --- Authentication Helpers and Decorators ---
def _get_current_user():
    """현재 세션의 사용자 객체 반환"""
    from flask import g
    if 'student_id' not in session:
        return None
    g.user = db.session.get(User, session['student_id'])
    if not g.user:
        session.clear()
    return g.user

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = _get_current_user()
        if not user:
            flash("로그인이 필요합니다.", "warning")
            return redirect(url_for('login', next=request.url))
        return f(*args, **kwargs)
    return decorated_function

def post_manager_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = _get_current_user()
        if not user:
            flash("로그인이 필요합니다.", "warning")
            return redirect(url_for('login'))
        if not user.can_manage_posts:
            flash("게시물 관리 권한이 없습니다.", "danger")
            return redirect(url_for('index'))
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = _get_current_user()
        if not user:
            flash("로그인이 필요합니다.", "warning")
            return redirect(url_for('login'))
        if not user.is_admin:
            flash("접근 권한이 없습니다. 관리자만 접근 가능합니다.", "danger")
            return redirect(url_for('index'))
        return f(*args, **kwargs)
    return decorated_function


# --- 데이터 로드 및 정제 함수 ---
def load_bus_schedule():
    schedule = []
    try:
        with open(BUS_TIME_PATH, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                note = row.get('Note', '').strip()
                route = row.get('Route', '')

                # 경로 한국어 변환
                if route == 'Station_to_School': route_kr = '조치원역 → 학교'
                elif route == 'School_to_Station': route_kr = '학교 → 조치원역'
                elif route == 'Station_to_Osong': route_kr = '조치원역 → 오송역'
                elif route == 'School_to_Osong': route_kr = '학교 → 조치원역/오송역'
                else: route_kr = route

                # 그룹핑
                route_group = "Jochiwon"
                if '오송역' in note or route.endswith('Osong'):
                    route_group = "Osong_Included"
                    if route == 'Station_to_School': route_kr = '조치원/오송역 → 학교 (경유)'
                    elif route == 'School_to_Station': route_kr = '학교 → 조치원역/오송역 (경유)'

                type_kr = '평일' if row.get('Type') == 'Weekday' else '일요일' if row.get('Type') == 'Sunday' else '기타'

                schedule.append({
                    "time": row.get('Departure_Time'),
                    "route": route_kr,
                    "type": type_kr,
                    "note": note,
                    "route_group": route_group
                })
        return schedule
    except Exception as e:
        print(f"Error loading bus schedule: {e}")
        return []

def load_meal_data():
    data = {}
    try:
        with open(STUDENT_MENU_PATH, 'r', encoding='utf-8') as f:
            student_data = json.load(f)
            data['student'] = student_data.get('메뉴', {})
            data['student_period'] = student_data.get('기간', {})

        with open(STAFF_MENU_PATH, 'r', encoding='utf-8') as f:
            staff_data = json.load(f)
            data['faculty'] = staff_data.get('메뉴', {})
            data['faculty_period'] = staff_data.get('기간', {})

    except Exception as e:
        print(f"Error loading meal data: {e}")
        data = {'student': {}, 'faculty': {}, 'student_period': {}, 'faculty_period': {}}
    return data

def get_today_meal_key():
    today_kst = datetime.now(KST) # KST 기준으로 오늘 날짜 가져오기
    day_of_week_kr = ['월', '화', '수', '목', '금', '토', '일'][today_kst.weekday()]
    return f"{today_kst.month}.{today_kst.day}({day_of_week_kr})"

def menu_to_string(menu_list):
    if not menu_list:
        return ""

    # Kcal, 숫자, ( ) 안 내용 제거 및 공백 정리
    cleaned_menu = []
    for item in menu_list:
        if item and not item.lower().endswith('kcal') and not item.isdigit() and 'kcal' not in item.lower():
            # ( ) 제거
            item_cleaned = item.split('(')[0].strip()
            if item_cleaned: # ( ) 제거 후 남은 내용이 있는지 확인
                cleaned_menu.append(item_cleaned)

    # 중복 제거 및 정렬
    unique_menu = sorted(list(set(cleaned_menu)))
    return ", ".join(unique_menu)

def format_meal_for_client(menu_data, target_date_key, cafeteria_type):
    formatted_menu = {
        "breakfast": "식단 정보 없음",
        "lunch": "식단 정보 없음",
        "dinner": "식단 정보 없음"
    }
    daily_menu = menu_data.get(target_date_key, {})

    if cafeteria_type == 'student':
        formatted_menu['lunch'] = {
            'korean': "식단 정보 없음",
            'ala_carte': "식단 정보 없음", # 일품 + 분식
            'snack_plus': "식단 정보 없음"
        }

        if '조식' in daily_menu:
            formatted_menu['breakfast'] = menu_to_string(daily_menu['조식'].get('메뉴', []))

        # 중식
        if '중식-한식' in daily_menu:
            formatted_menu['lunch']['korean'] = menu_to_string(daily_menu['중식-한식'].get('메뉴', []))

        ala_carte_items = []
        if '중식-일품' in daily_menu:
            ilpum_str = menu_to_string(daily_menu['중식-일품'].get('메뉴', []))
            if ilpum_str:
                ala_carte_items.append("일품: " + ilpum_str)
        if '중식-분식' in daily_menu:
            bunsik_str = menu_to_string(daily_menu['중식-분식'].get('메뉴', []))
            if bunsik_str:
                ala_carte_items.append("분식: " + bunsik_str)

        if ala_carte_items:
            formatted_menu['lunch']['ala_carte'] = " / ".join(ala_carte_items)

        if '중식-plus' in daily_menu:
            formatted_menu['lunch']['snack_plus'] = menu_to_string(daily_menu['중식-plus'].get('메뉴', []))

        if '석식' in daily_menu:
            formatted_menu['dinner'] = menu_to_string(daily_menu['석식'].get('메뉴', []))

    elif cafeteria_type == 'faculty':
        formatted_menu['breakfast'] = "조식 제공 없음" # 교직원은 조식/석식 없음
        formatted_menu['dinner'] = "석식 제공 없음"

        if '중식' in daily_menu:
            formatted_menu['lunch'] = menu_to_string(daily_menu['중식'].get('메뉴', []))

    return formatted_menu

def format_weekly_meal_for_client(weekly_meal_data):
    formatted_data = {
        "기간": weekly_meal_data.get('student_period', weekly_meal_data.get('faculty_period', {})),
        "식단": {
            "student": weekly_meal_data.get('student', {}),
            "faculty": weekly_meal_data.get('faculty', {})
        }
    }
    return formatted_data


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
            hashed_password = generate_password_hash(password)
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
            _create_semesters_for_user(new_user.id)

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
            valid_files = [f for f in image_files if f and f.filename != '' and allowed_file(f.filename)]

            if len(valid_files) > MAX_UPLOADS:
                flash(f'이미지는 최대 {MAX_UPLOADS}개까지 첨부할 수 있습니다.', 'warning')
                return render_template('create_post.html', user=user, title=title, content=content, is_notice=is_notice, categories=post_categories, category=category, expires_at=expires_at_str, config=app.config)

            if len(image_files) > len(valid_files) and len(valid_files) < len(image_files):
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
            valid_new_files = [f for f in new_image_files if f and f.filename != '' and allowed_file(f.filename)]

            if len(new_image_files) > len(valid_new_files) and len(valid_new_files) < len(new_image_files):
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
    scheduler = BackgroundScheduler(timezone='Asia/Seoul') # 한국 시간대 기준
    # 매일 자정(KST)에 학기 관리 작업 실행 (예시)
    # scheduler.add_job(manage_semesters_job, 'cron', month=12, day=1, hour=3, id='semester_management_job')

    # 테스트용: 1시간마다 실행
    scheduler.add_job(manage_semesters_job, 'interval', minutes=600, id='semester_management_job_test')

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