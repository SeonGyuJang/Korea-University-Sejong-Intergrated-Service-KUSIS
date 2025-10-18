from flask import Flask, render_template, jsonify, request, redirect, url_for, session, flash
from datetime import datetime, timedelta, date
import json
import csv
import os
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash
from flask_sqlalchemy import SQLAlchemy
import urllib.parse
from dotenv import load_dotenv
from apscheduler.schedulers.background import BackgroundScheduler
import atexit

load_dotenv()

app = Flask(__name__)

# --- Configuration ---
app.secret_key = 'your_super_secret_key_for_session_management'
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

db = SQLAlchemy(app)

# --- Flask CLI 명령어 (최초 DB 생성용) ---
@app.cli.command("init-db")
def init_db_command():
    """Creates the database tables and initial data."""
    create_initial_data()
    print("Database initialized.")


# --- File Paths ---
BUS_TIME_PATH = os.path.join(os.path.dirname(__file__), 'schedules', 'bus_time.csv')
STUDENT_MENU_PATH = os.path.join(os.path.dirname(__file__), 'menu_data', 'student_menu.json')
STAFF_MENU_PATH = os.path.join(os.path.dirname(__file__), 'menu_data', 'staff_menu.json')


# --- Data Structures for Users/Admin ---
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
    password_hash = db.Column(db.String(128), nullable=False)
    is_admin = db.Column(db.Boolean, default=False, nullable=False)
    total_credits_goal = db.Column(db.Integer, default=130, nullable=False)

    semesters = db.relationship('Semester', backref='user', lazy=True, cascade="all, delete-orphan")
    subjects = db.relationship('Subject', backref='user', lazy=True, cascade="all, delete-orphan")
    schedules = db.relationship('Schedule', backref='user', lazy=True, cascade="all, delete-orphan")
    study_logs = db.relationship('StudyLog', backref='user', lazy=True, cascade="all, delete-orphan")
    quick_links = db.relationship('QuickLink', backref='user', lazy=True, cascade="all, delete-orphan")

class Semester(db.Model):
    __tablename__ = 'semesters'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(10), db.ForeignKey('users.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    year = db.Column(db.Integer, nullable=False)
    season = db.Column(db.String(50), nullable=False)
    subjects = db.relationship('Subject', backref='semester', lazy=True, cascade="all, delete-orphan")
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
    memo = db.Column(db.Text, default=json.dumps({"note": "", "todos": []}))
    timeslots = db.relationship('TimeSlot', backref='subject', lazy=True, cascade="all, delete-orphan")
    weekly_memos = db.relationship('WeeklyMemo', backref='subject', lazy=True, cascade="all, delete-orphan")

class TimeSlot(db.Model):
    __tablename__ = 'timeslots'
    id = db.Column(db.Integer, primary_key=True)
    subject_id = db.Column(db.Integer, db.ForeignKey('subjects.id'), nullable=False)
    day_of_week = db.Column(db.Integer, nullable=False)
    start_time = db.Column(db.String(5), nullable=False)
    end_time = db.Column(db.String(5), nullable=False)
    room = db.Column(db.String(50))

class WeeklyMemo(db.Model):
    __tablename__ = 'weekly_memos'
    id = db.Column(db.Integer, primary_key=True)
    subject_id = db.Column(db.Integer, db.ForeignKey('subjects.id'), nullable=False)
    week_number = db.Column(db.Integer, nullable=False)
    note = db.Column(db.Text, default="")
    todos = db.Column(db.Text, default=json.dumps([]))
    __table_args__ = (db.UniqueConstraint('subject_id', 'week_number', name='_subject_week_uc'),)

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

class QuickLink(db.Model):
    __tablename__ = 'quick_links'
    entry_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(10), db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(100), nullable=False)
    url = db.Column(db.String(500), nullable=False)
    icon_url = db.Column(db.String(500))

# --- 학기 생성 로직 ---
def _create_semesters_for_user(user_id):
    """지정된 사용자를 위해 2020년부터 2025년까지의 모든 학기를 생성합니다."""
    start_year = 2020
    end_year = 2025
    seasons = ["1학기", "여름학기", "2학기", "겨울학기"]

    for year in range(start_year, end_year + 1):
        for season in seasons:
            semester_name = f"{year}년 {season}"
            existing_semester = Semester.query.filter_by(user_id=user_id, name=semester_name).first()
            if not existing_semester:
                new_semester = Semester(user_id=user_id, name=semester_name, year=year, season=season)
                db.session.add(new_semester)
    db.session.commit()

# --- [FIX #6] 학기 시작일 계산 헬퍼 (Calendar.csv 기반) ---
def _get_semester_start_date(semester):
    """학기 객체를 기반으로 실제 시작 날짜를 반환합니다."""
    if not semester:
        return date.today()
    
    # 2025년 Calendar.csv 기준 실제 날짜
    if semester.year == 2025:
        if "1학기" in semester.season:
            return date(2025, 3, 4)  # 2025학년도 제1학기 개강
        elif "여름학기" in semester.season:
            return date(2025, 6, 24)  # 여름계절수업 개강
        elif "2학기" in semester.season:
            return date(2025, 9, 1)  # 2025학년도 제2학기 개강
        elif "겨울학기" in semester.season:
            return date(2025, 12, 22)  # 겨울계절수업 개강
    
    # 다른 연도는 대략적인 날짜 추정
    if "1학기" in semester.season:
        return date(semester.year, 3, 1)
    elif "2학기" in semester.season:
        return date(semester.year, 9, 1)
    elif "여름학기" in semester.season:
        return date(semester.year, 6, 20)
    elif "겨울학기" in semester.season:
        return date(semester.year, 12, 20)
    
    return date(semester.year, 1, 1)

# --- [NEW #1] 현재 학기 결정 함수 ---
def _get_current_semester_for_user(user_id):
    """오늘 날짜를 기준으로 사용자의 현재 학기를 반환합니다."""
    today = date.today()
    
    # 사용자의 모든 학기 가져오기
    semesters = Semester.query.filter_by(user_id=user_id).order_by(Semester.year.desc()).all()
    
    if not semesters:
        return None
    
    # 학기별 시작일과 종료일 계산 (대략 16주)
    for semester in semesters:
        start_date = _get_semester_start_date(semester)
        end_date = start_date + timedelta(weeks=16)
        
        if start_date <= today <= end_date:
            return semester
    
    # 현재 진행 중인 학기가 없으면 가장 최근 학기 반환
    return semesters[0]

# --- 학기 자동 관리 스케줄 작업 ---
def manage_semesters_job():
    """
    매년 12월 1일에 실행되는 학기 관리 작업.
    1. 다음 연도 학기(1,여름,2,겨울)를 모든 사용자에게 추가합니다.
    2. 사용자의 학기 중 '가장 오래된 연도'의 학기(Subject가 없는)를 삭제합니다.
    """
    with app.app_context():
        print(f"[{datetime.now()}] Starting semester management job...")
        try:
            now = datetime.now()
            next_year = now.year + 1
            seasons = ["1학기", "여름학기", "2학기", "겨울학기"]
            
            all_users = User.query.all()
            if not all_users:
                print("No users found. Exiting job.")
                return

            for user in all_users:
                # 1. 다음 연도 학기 추가
                for season in seasons:
                    semester_name = f"{next_year}년 {season}"
                    exists = Semester.query.filter_by(user_id=user.id, name=semester_name).first()
                    if not exists:
                        new_semester = Semester(
                            user_id=user.id,
                            name=semester_name,
                            year=next_year,
                            season=season
                        )
                        db.session.add(new_semester)
                        print(f"Added {semester_name} for user {user.id}")
                
                # 2. 가장 오래된 연도의 빈 학기 삭제
                oldest_semester = Semester.query.filter_by(user_id=user.id).order_by(Semester.year.asc()).first()
                if not oldest_semester:
                    continue
                
                oldest_year = oldest_semester.year
                print(f"Checking oldest year {oldest_year} for user {user.id}")

                oldest_year_semesters = Semester.query.filter_by(user_id=user.id, year=oldest_year).all()
                
                for semester in oldest_year_semesters:
                    has_subjects = Subject.query.filter_by(semester_id=semester.id).first()
                    if not has_subjects:
                        db.session.delete(semester)
                        print(f"Deleted oldest empty semester {semester.name} for user {user.id}")
                    else:
                        print(f"Keeping oldest semester {semester.name} (has data) for user {user.id}")

            db.session.commit()
            print("Semester management job completed successfully.")
        except Exception as e:
            db.session.rollback()
            print(f"Error in semester management job: {e}")

# --- DB 초기화 ---
def create_initial_data():
    with app.app_context():
        db.create_all()
        admin_id = "9999123456"
        sample_user_id = "2023390822"

        # 관리자 계정 생성 및 학기 추가
        if not db.session.get(User, admin_id):
            admin_user = User(id=admin_id, name="admin", dob="2000-01-01", college="관리자", department="관리팀", password_hash=generate_password_hash("1234"), is_admin=True)
            db.session.add(admin_user)
            db.session.commit()
            _create_semesters_for_user(admin_id)

        # 샘플 유저 생성 및 학기 추가, 샘플 데이터 추가
        if not db.session.get(User, sample_user_id):
            sample_user = User(name="장선규", id=sample_user_id, dob="2004-03-24", college="과학기술대학", department="컴퓨터융합소프트웨어학과", password_hash=generate_password_hash("password123"), is_admin=False)
            db.session.add(sample_user)
            db.session.commit()
            _create_semesters_for_user(sample_user_id)
            
            # 샘플 데이터 추가 (2025년 2학기에)
            sample_semester = Semester.query.filter_by(user_id=sample_user_id, name="2025년 2학기").first()
            if sample_semester:
                web_memo = json.dumps({"note": "과제 제출 기한 엄수! (과목 전체 메모)", "todos": [{"task": "Flask 라우팅 공부", "done": False}]})
                s1 = Subject(user_id=sample_user_id, semester_id=sample_semester.id, name="웹프로그래밍", professor="최교수", credits=3, memo=web_memo)
                s2 = Subject(user_id=sample_user_id, semester_id=sample_semester.id, name="데이터베이스", professor="김교수", credits=3)
                db.session.add_all([s1, s2])
                db.session.commit()
                db.session.add(TimeSlot(subject_id=s1.id, day_of_week=1, start_time="10:00", end_time="11:15", room="창의관 101"))
                db.session.add(TimeSlot(subject_id=s1.id, day_of_week=3, start_time="10:00", end_time="11:15", room="창의관 101"))
                db.session.add(TimeSlot(subject_id=s2.id, day_of_week=2, start_time="13:30", end_time="14:45", room="세종관 205"))
                db.session.add(TimeSlot(subject_id=s2.id, day_of_week=4, start_time="13:30", end_time="14:45", room="세종관 205"))
                
                # 샘플 주차별 메모 추가
                db.session.add(WeeklyMemo(
                    subject_id=s1.id, 
                    week_number=3, 
                    note="3주차: Flask 기본 라우팅", 
                    todos=json.dumps([{"task": "routes.py 실습", "done": True}, {"task": "templates 개념 익히기", "done": False}])
                ))
                db.session.add(WeeklyMemo(
                    subject_id=s1.id, 
                    week_number=4, 
                    note="4주차: DB 연동 (SQLAlchemy)", 
                    todos=json.dumps([{"task": "models.py 설계", "done": False}])
                ))

            # 샘플 퀵링크/일정
            QuickLink.query.filter_by(user_id=sample_user_id).delete()
            db.session.add_all([
                QuickLink(user_id=sample_user_id, title="네이버", url="https://www.naver.com", icon_url="fa-solid fa-n"),
                QuickLink(user_id=sample_user_id, title="LMS", url="https://lms.korea.ac.kr", icon_url="fa-solid fa-book"),
            ])
            db.session.commit()

# --- Authentication Decorators ---
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'student_id' not in session:
            flash("로그인이 필요합니다.", "warning")
            return redirect(url_for('login', next=request.url))
        user = db.session.get(User, session['student_id'])
        if not user:
            session.clear()
            flash("사용자 정보가 유효하지 않습니다. 다시 로그인해주세요.", "danger")
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'student_id' not in session:
            flash("로그인이 필요합니다.", "warning")
            return redirect(url_for('login'))
        user = db.session.get(User, session['student_id'])
        if not user or not user.is_admin:
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
                if route == 'Station_to_School': route_kr = '조치원역 → 학교'
                elif route == 'School_to_Station': route_kr = '학교 → 조치원역'
                elif route == 'Station_to_Osong': route_kr = '조치원역 → 오송역'
                elif route == 'School_to_Osong': route_kr = '학교 → 조치원역/오송역'
                else: route_kr = route
                if '오송역' in note:
                    if route == 'Station_to_School': route_kr = '조치원/오송역 → 학교 (경유)'
                    elif route == 'School_to_Station': route_kr = '학교 → 조치원역/오송역 (경유)'
                route_group = "Jochiwon"
                if '오송역' in note or route.endswith('Osong'): route_group = "Osong_Included"
                type_kr = '평일' if row.get('Type') == 'Weekday' else '일요일' if row.get('Type') == 'Sunday' else '기타'
                schedule.append({"time": row.get('Departure_Time'), "route": route_kr, "type": type_kr, "note": note, "route_group": route_group})
        return schedule
    except Exception as e:
        print(f"Error loading bus schedule: {e}")
        return []

def load_meal_data():
    data = {}
    try:
        with open(STUDENT_MENU_PATH, 'r', encoding='utf-8') as f:
            student_data = json.load(f)
            data['student'] = student_data['메뉴']
            data['student_period'] = student_data['기간']
        with open(STAFF_MENU_PATH, 'r', encoding='utf-8') as f:
            staff_data = json.load(f)
            data['faculty'] = staff_data['메뉴']
            data['faculty_period'] = staff_data['기간']
    except Exception as e:
        print(f"Error loading meal data: {e}")
        data = {'student': {}, 'faculty': {}}
    return data

def get_today_meal_key():
    today = datetime.now()
    day_of_week_kr = ['월', '화', '수', '목', '금', '토', '일'][today.weekday()]
    return f"{today.month}.{today.day}({day_of_week_kr})"

def menu_to_string(menu_list):
    cleaned_menu = [item.strip() for item in menu_list if not item.lower().endswith('kcal') and not item.isdigit() and 'kcal' not in item.lower()]
    cleaned_menu = [item.split('(')[0].strip() for item in cleaned_menu]
    return ", ".join(sorted(list(set(item for item in cleaned_menu if item))))

def format_meal_for_client(menu_data, target_date_key, cafeteria_type):
    formatted_menu = {"breakfast": "식단 정보 없음", "lunch": "식단 정보 없음", "dinner": "식단 정보 없음"}
    if cafeteria_type == 'student': formatted_menu['lunch'] = {'korean': "식단 정보 없음", 'ala_carte': "식단 정보 없음", 'snack_plus': "식단 정보 없음"}
    daily_menu = menu_data.get(target_date_key, {})
    if cafeteria_type == 'student':
        if '조식' in daily_menu: formatted_menu['breakfast'] = menu_to_string(daily_menu['조식']['메뉴'])
        if '중식-한식' in daily_menu: formatted_menu['lunch']['korean'] = menu_to_string(daily_menu['중식-한식']['메뉴'])
        ala_carte_items = []
        if '중식-일품' in daily_menu: ala_carte_items.append("일품: " + menu_to_string(daily_menu['중식-일품']['메뉴']))
        if '중식-분식' in daily_menu: ala_carte_items.append("분식: " + menu_to_string(daily_menu['중식-분식']['메뉴']))
        if ala_carte_items: formatted_menu['lunch']['ala_carte'] = " / ".join(ala_carte_items)
        if '중식-plus' in daily_menu: formatted_menu['lunch']['snack_plus'] = menu_to_string(daily_menu['중식-plus']['메뉴'])
        if '석식' in daily_menu: formatted_menu['dinner'] = menu_to_string(daily_menu['석식']['메뉴'])
    elif cafeteria_type == 'faculty':
        formatted_menu['breakfast'] = "조식 제공 없음"
        formatted_menu['dinner'] = "석식 제공 없음"
        if '중식' in daily_menu: formatted_menu['lunch'] = menu_to_string(daily_menu['중식']['메뉴'])
    return formatted_menu

def format_weekly_meal_for_client(weekly_meal_data):
    formatted_data = {"기간": weekly_meal_data.get('student_period', weekly_meal_data.get('faculty_period', {})), "식단": {}}
    all_date_keys = sorted(set(weekly_meal_data.get('student', {}).keys()).union(set(weekly_meal_data.get('faculty', {}).keys())))
    for cafeteria_type in ['student', 'faculty']:
        formatted_data['식단'][cafeteria_type] = {}
        menu_data = weekly_meal_data.get(cafeteria_type, {})
        for date_key in all_date_keys:
            formatted_data['식단'][cafeteria_type][date_key] = format_meal_for_client(menu_data, date_key, cafeteria_type)
    return formatted_data

SHUTTLE_SCHEDULE_DATA = load_bus_schedule()
MEAL_PLAN_DATA = load_meal_data()
TODAY_MEAL_KEY = get_today_meal_key()

# --- 페이지 엔드포인트 ---
@app.route('/')
def index():
    user_info = None
    is_admin = False
    if 'student_id' in session:
        user_info = db.session.get(User, session['student_id'])
        if user_info:
            is_admin = user_info.is_admin
        else:
            session.clear()
    return render_template('index.html', user=user_info, is_admin=is_admin)

@app.route('/timetable-management')
@login_required
def timetable_management():
    user_id = session['student_id']
    user = db.session.get(User, user_id)
    
    # 이수 학점 계산 (성적과 무관하게 등록된 모든 과목의 학점을 합산)
    all_user_subjects = Subject.query.filter_by(user_id=user_id).all()
    total_earned_credits = sum(subject.credits for subject in all_user_subjects)

    # GPA 계산 (성적이 있는 과목만 계산)
    GRADE_MAP = {"A+": 4.5, "A0": 4.0, "B+": 3.5, "B0": 3.0, "C+": 2.5, "C0": 2.0, "D+": 1.5, "D0": 1.0, "F": 0.0}
    total_gpa_credits = 0
    total_gpa_score = 0
    for subject in all_user_subjects:
        grade_score = GRADE_MAP.get(subject.grade)
        if grade_score is not None:
            total_gpa_credits += subject.credits
            total_gpa_score += (grade_score * subject.credits)
    overall_gpa = (total_gpa_score / total_gpa_credits) if total_gpa_credits > 0 else 0.0

    return render_template(
        'timetable_management.html',
        user=user,
        is_admin=user.is_admin,
        current_credits=total_earned_credits,
        goal_credits=user.total_credits_goal,
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
            session.clear()
            session['student_id'] = user.id
            session.permanent = True
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
        dob = request.form.get('dob')
        college = request.form.get('college')
        department = request.form.get('department')

        if not all([name, student_id, password, password_confirm, dob, college, department]):
             flash("모든 필드를 입력해주세요.", "danger")
             return render_template('register.html', colleges=COLLEGES)
        
        if password != password_confirm:
            flash("비밀번호가 일치하지 않습니다.", "danger")
            return render_template('register.html', colleges=COLLEGES)
        
        if User.query.get(student_id):
            flash("이미 가입된 학번입니다.", "danger")
            return render_template('register.html', colleges=COLLEGES)

        try:
            hashed_password = generate_password_hash(password)
            new_user = User(id=student_id, name=name, dob=dob, college=college, department=department, password_hash=hashed_password, is_admin=False, total_credits_goal=130)
            db.session.add(new_user)
            db.session.commit()
            
            _create_semesters_for_user(new_user.id)
            
            flash("회원가입이 성공적으로 완료되었습니다. 로그인해주세요.", "success")
            return redirect(url_for('login'))
        except Exception as e:
            db.session.rollback()
            print(f"Error during registration: {e}")
            flash("회원가입 중 오류가 발생했습니다. 다시 시도해주세요.", "danger")

    return render_template('register.html', colleges=COLLEGES)

@app.route('/admin')
@admin_required
def admin_dashboard():
    all_users = User.query.all()
    member_count = len(all_users)
    member_list = sorted([{"id": user.id, "name": user.name, "department": user.department, "is_admin": user.is_admin} for user in all_users], key=lambda x: x['id'])
    return render_template('admin.html', member_count=member_count, member_list=member_list)

# --- Public API Endpoints ---
@app.route('/api/shuttle')
def get_shuttle():
    return jsonify(SHUTTLE_SCHEDULE_DATA)

@app.route('/api/meal')
def get_meal():
    cafeteria = request.args.get('cafeteria', 'student')
    if cafeteria in MEAL_PLAN_DATA:
        formatted_meal = format_meal_for_client(MEAL_PLAN_DATA[cafeteria], TODAY_MEAL_KEY, cafeteria)
        return jsonify(formatted_meal)
    return jsonify({"error": "Invalid cafeteria type"}), 400

@app.route('/api/meal/week')
def get_weekly_meal():
    formatted_data = format_weekly_meal_for_client(MEAL_PLAN_DATA)
    return jsonify(formatted_data)

# --- Secure API Endpoints ---
@app.route('/api/schedule')
@login_required
def get_schedule():
    today_str = datetime.now().strftime('%Y-%m-%d')
    user_schedules = Schedule.query.filter_by(user_id=session['student_id'], date=today_str).order_by(Schedule.time).all()
    schedule_list = [{"time": s.time, "title": s.title, "location": s.location} for s in user_schedules]
    return jsonify(schedule_list)

# --- 시간표/학기/학점 API ---
@app.route('/api/semesters', methods=['GET'])
@login_required
def handle_semesters():
    user_id = session['student_id']
    semesters = Semester.query.filter_by(user_id=user_id).all()
    
    # 학기 정렬 (최신순)
    season_order = {"1학기": 1, "여름학기": 2, "2학기": 3, "겨울학기": 4}
    semesters.sort(key=lambda s: (s.year, season_order.get(s.season, 99)), reverse=True)
    
    return jsonify([{"id": s.id, "name": s.name} for s in semesters])


@app.route('/api/timetable-data', methods=['GET'])
@login_required
def get_timetable_data():
    user_id = session['student_id']
    semester_id_str = request.args.get('semester_id')

    query = Semester.query.filter_by(user_id=user_id)
    if semester_id_str:
        semester = query.filter_by(id=int(semester_id_str)).first()
    else:
        # [FIX #1] 현재 학기 자동 선택
        semester = _get_current_semester_for_user(user_id)

    if not semester:
        return jsonify({"semester_id": None, "subjects": []})
    
    subjects = Subject.query.filter_by(user_id=user_id, semester_id=semester.id).all()
    result = []
    for s in subjects:
        timeslots_data = [{"id": ts.id, "day": ts.day_of_week, "start": ts.start_time, "end": ts.end_time, "room": ts.room} for ts in s.timeslots]
        try:
            memo_data = json.loads(s.memo) if s.memo else {"note": "", "todos": []}
        except (json.JSONDecodeError, TypeError):
            memo_data = {"note": "", "todos": []}
        result.append({"id": s.id, "name": s.name, "professor": s.professor, "credits": s.credits, "grade": s.grade, "memo": memo_data, "timeslots": timeslots_data})
    return jsonify({"semester_id": semester.id, "subjects": result})

@app.route('/api/subjects', methods=['POST'])
@login_required
def create_subject():
    user_id = session['student_id']
    data = request.json
    semester_id = data.get('semester_id')
    name = data.get('name')
    
    if not semester_id or not name:
        return jsonify({"status": "error", "message": "학기 ID와 과목명은 필수입니다."}), 400

    semester = db.session.get(Semester, semester_id)
    if not semester or semester.user_id != user_id:
        return jsonify({"status": "error", "message": "유효하지 않은 학기입니다."}), 404

    try:
        new_subject = Subject(
            user_id=user_id,
            semester_id=semester_id,
            name=name,
            professor=data.get('professor'),
            credits=data.get('credits', 3),
            grade='Not Set',
            memo=json.dumps({"note": "", "todos": []})
        )
        db.session.add(new_subject)
        db.session.flush()

        for ts_data in data.get('timeslots', []):
            db.session.add(TimeSlot(
                subject_id=new_subject.id, day_of_week=ts_data.get('day'),
                start_time=ts_data.get('start'), end_time=ts_data.get('end'), room=ts_data.get('room')
            ))
        db.session.commit()
        
        created_subject_data = {
            "id": new_subject.id, "name": new_subject.name, "professor": new_subject.professor,
            "credits": new_subject.credits, "grade": new_subject.grade,
            "memo": json.loads(new_subject.memo),
            "timeslots": [{"id": ts.id, "day": ts.day_of_week, "start": ts.start_time, "end": ts.end_time, "room": ts.room} for ts in new_subject.timeslots]
        }
        return jsonify({"status": "success", "message": "과목이 추가되었습니다.", "subject": created_subject_data}), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "message": f"과목 추가 중 오류 발생: {e}"}), 500

@app.route('/api/subjects/<int:subject_id>', methods=['PUT', 'DELETE'])
@login_required
def handle_subject(subject_id):
    user_id = session['student_id']
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
            
            if 'memo' in data and isinstance(data.get('memo'), dict):
                subject.memo = json.dumps(data['memo'])

            TimeSlot.query.filter_by(subject_id=subject.id).delete()
            for ts_data in data.get('timeslots', []):
                db.session.add(TimeSlot(
                    subject_id=subject.id, day_of_week=ts_data.get('day'),
                    start_time=ts_data.get('start'), end_time=ts_data.get('end'), room=ts_data.get('room')
                ))
            db.session.commit()

            updated_subject_data = {
                "id": subject.id, "name": subject.name, "professor": subject.professor,
                "credits": subject.credits, "grade": subject.grade,
                "memo": json.loads(subject.memo),
                "timeslots": [{"id": ts.id, "day": ts.day_of_week, "start": ts.start_time, "end": ts.end_time, "room": ts.room} for ts in subject.timeslots]
            }
            return jsonify({"status": "success", "message": "과목이 수정되었습니다.", "subject": updated_subject_data})
        except Exception as e:
            db.session.rollback()
            return jsonify({"status": "error", "message": f"과목 수정 중 오류 발생: {e}"}), 500

    if request.method == 'DELETE':
        try:
            db.session.delete(subject)
            db.session.commit()
            return jsonify({"status": "success", "message": "과목이 삭제되었습니다."})
        except Exception as e:
            db.session.rollback()
            return jsonify({"status": "error", "message": f"과목 삭제 중 오류 발생: {e}"}), 500

# --- [FIX #5, #6] 주차별 메모/Todo API ---
@app.route('/api/subjects/<int:subject_id>/week/<int:week_number>', methods=['GET'])
@login_required
def get_weekly_memo(subject_id, week_number):
    user_id = session['student_id']
    subject = db.session.get(Subject, subject_id)

    if not subject or subject.user_id != user_id:
        return jsonify({"status": "error", "message": "과목을 찾을 수 없거나 권한이 없습니다."}), 404

    try:
        # [FIX #6] 주차별 날짜 계산
        semester = subject.semester
        semester_start_date = _get_semester_start_date(semester)
        week_start_date = semester_start_date + timedelta(weeks=(week_number - 1))
        week_end_date = week_start_date + timedelta(days=6)
        
        # 연도 표시 (다른 연도면 연도 포함)
        today_year = date.today().year
        if week_start_date.year == today_year and week_end_date.year == today_year:
            week_date_str = f"{week_start_date.strftime('%m.%d')} ~ {week_end_date.strftime('%m.%d')}"
        else:
            week_date_str = f"{week_start_date.strftime('%y.%m.%d')} ~ {week_end_date.strftime('%y.%m.%d')}"

        weekly_memo = WeeklyMemo.query.filter_by(subject_id=subject.id, week_number=week_number).first()
        
        if weekly_memo:
            todos = json.loads(weekly_memo.todos) if weekly_memo.todos else []
            note = weekly_memo.note if weekly_memo.note else ""
        else:
            todos, note = [], ""

        return jsonify({
            "status": "success",
            "week_number": week_number,
            "week_date_str": week_date_str,
            "note": note,
            "todos": todos
        })
    except Exception as e:
        return jsonify({"status": "error", "message": f"주차별 정보 로드 중 오류: {e}"}), 500


@app.route('/api/subjects/<int:subject_id>/week/<int:week_number>', methods=['PUT'])
@login_required
def update_weekly_memo(subject_id, week_number):
    user_id = session['student_id']
    subject = db.session.get(Subject, subject_id)

    if not subject or subject.user_id != user_id:
        return jsonify({"status": "error", "message": "과목을 찾을 수 없거나 권한이 없습니다."}), 404
    
    data = request.json
    note = data.get('note', '')
    todos = data.get('todos', [])
    
    if not isinstance(todos, list):
        return jsonify({"status": "error", "message": "잘못된 todos 형식입니다."}), 400

    try:
        weekly_memo = WeeklyMemo.query.filter_by(subject_id=subject.id, week_number=week_number).first()
        
        if not weekly_memo:
            weekly_memo = WeeklyMemo(subject_id=subject.id, week_number=week_number)
            db.session.add(weekly_memo)

        weekly_memo.note = note
        weekly_memo.todos = json.dumps(todos)
        
        db.session.commit()
        
        return jsonify({
            "status": "success",
            "message": f"{week_number}주차 정보가 저장되었습니다.",
            "data": {
                "week_number": week_number,
                "note": weekly_memo.note,
                "todos": json.loads(weekly_memo.todos)
            }
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "message": f"주차별 정보 저장 중 오류: {e}"}), 500

# [FIX #7] 모든 주차 정보 모아보기 API (월별 그룹핑)
@app.route('/api/subjects/<int:subject_id>/all-weeks', methods=['GET'])
@login_required
def get_all_weekly_memos(subject_id):
    user_id = session['student_id']
    subject = db.session.get(Subject, subject_id)

    if not subject or subject.user_id != user_id:
        return jsonify({"status": "error", "message": "과목을 찾을 수 없거나 권한이 없습니다."}), 404
    
    try:
        all_memos = WeeklyMemo.query.filter_by(subject_id=subject.id).order_by(WeeklyMemo.week_number).all()
        
        semester = subject.semester
        semester_start_date = _get_semester_start_date(semester)
        
        # 월별로 그룹핑
        months_data = {}
        
        for week_num in range(1, 17):
            week_start = semester_start_date + timedelta(weeks=(week_num - 1))
            week_end = week_start + timedelta(days=6)
            
            # 연도 표시
            today_year = date.today().year
            if week_start.year == today_year:
                date_range = f"{week_start.strftime('%m.%d')} ~ {week_end.strftime('%m.%d')}"
            else:
                date_range = f"{week_start.strftime('%y.%m.%d')} ~ {week_end.strftime('%y.%m.%d')}"
            
            # 월 키 생성 (예: "2025년 3월")
            month_key = f"{week_start.year}년 {week_start.month}월"
            
            if month_key not in months_data:
                months_data[month_key] = []
            
            memo_data = next((m for m in all_memos if m.week_number == week_num), None)
            
            week_info = {
                "week_number": week_num,
                "date_range": date_range,
                "note": memo_data.note if memo_data else "",
                "todos": json.loads(memo_data.todos) if memo_data else []
            }
            
            months_data[month_key].append(week_info)

        return jsonify({"status": "success", "subject_name": subject.name, "data": months_data})
    except Exception as e:
        return jsonify({"status": "error", "message": f"전체 주차 정보 로드 중 오류: {e}"}), 500

@app.route('/api/gpa-stats', methods=['GET'])
@login_required
def get_gpa_stats():
    user_id = session['student_id']
    semesters = Semester.query.filter_by(user_id=user_id).all()
    
    # 학기 정렬
    season_order = {"1학기": 1, "여름학기": 2, "2학기": 3, "겨울학기": 4}
    semesters.sort(key=lambda s: (s.year, season_order.get(s.season, 99)))

    stats = []
    GRADE_MAP = {"A+": 4.5, "A0": 4.0, "B+": 3.5, "B0": 3.0, "C+": 2.5, "C0": 2.0, "D+": 1.5, "D0": 1.0, "F": 0.0}
    
    for semester in semesters:
        subjects = semester.subjects
        semester_gpa_credits, semester_gpa_score = 0, 0
        for subject in subjects:
            grade_score = GRADE_MAP.get(subject.grade)
            if grade_score is not None:
                semester_gpa_credits += subject.credits
                semester_gpa_score += (grade_score * subject.credits)
        
        # 성적이 있는 학기만 그래프에 포함
        if semester_gpa_credits > 0:
            semester_gpa = (semester_gpa_score / semester_gpa_credits)
            stats.append({"semester_name": semester.name, "gpa": round(semester_gpa, 2)})

    # 이수 학점 계산 (성적과 무관)
    all_subjects = Subject.query.filter_by(user_id=user_id).all()
    total_earned_credits = sum(s.credits for s in all_subjects)
    
    # 전체 GPA 계산
    total_gpa_credits, total_gpa_score = 0, 0
    for subject in all_subjects:
        grade_score = GRADE_MAP.get(subject.grade)
        if grade_score is not None:
            total_gpa_credits += subject.credits
            total_gpa_score += (grade_score * subject.credits)
    overall_gpa = (total_gpa_score / total_gpa_credits) if total_gpa_credits > 0 else 0.0
    
    return jsonify({"semesters": stats, "overall_gpa": round(overall_gpa, 2), "total_earned_credits": total_earned_credits})

@app.route('/api/study-stats', methods=['GET'])
@login_required
def get_study_stats():
    user_id = session['student_id']
    today = datetime.now()
    today_str = today.strftime('%Y-%m-%d')
    today_log = StudyLog.query.filter_by(user_id=user_id, date=today_str).first()
    today_seconds = today_log.duration_seconds if today_log else 0
    seven_days_ago_str = (today - timedelta(days=6)).strftime('%Y-%m-%d')
    weekly_logs = StudyLog.query.filter(StudyLog.user_id == user_id, StudyLog.date >= seven_days_ago_str, StudyLog.date <= today_str).all()
    total_seconds = sum(log.duration_seconds for log in weekly_logs)
    weekly_avg_seconds = total_seconds / 7
    return jsonify({"today": today_seconds, "weekly_avg": weekly_avg_seconds})

@app.route('/api/study-time', methods=['POST'])
@login_required
def save_study_time():
    data = request.json
    duration_to_add = data.get('duration_to_add')
    date_str = data.get('date')
    user_id = session['student_id']
    if not isinstance(duration_to_add, int) or not date_str:
        return jsonify({"status": "error", "message": "잘못된 요청입니다."}), 400
    try:
        log_entry = StudyLog.query.filter_by(user_id=user_id, date=date_str).first()
        if log_entry:
            log_entry.duration_seconds += duration_to_add
        else:
            log_entry = StudyLog(user_id=user_id, date=date_str, duration_seconds=duration_to_add)
            db.session.add(log_entry)
        db.session.commit()
        return jsonify({"status": "success", "data": {"total_duration": log_entry.duration_seconds}})
    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "message": f"공부 시간 저장 중 오류 발생: {e}"}), 500

@app.route('/api/quick-links', methods=['GET', 'POST'])
@login_required
def handle_quick_links():
    user_id = session['student_id']
    if request.method == 'GET':
        links = QuickLink.query.filter_by(user_id=user_id).order_by(QuickLink.entry_id).all()
        return jsonify([{"id": link.entry_id, "title": link.title, "url": link.url, "icon_url": link.icon_url} for link in links])
    if request.method == 'POST':
        data = request.json
        title, url, icon_url = data.get('title'), data.get('url'), data.get('icon_url')
        if not title or not url: return jsonify({"status": "error", "message": "제목과 URL은 필수입니다."}), 400
        if not url.startswith(('http://', 'https://')): url = 'https://' + url
        try:
            new_link = QuickLink(user_id=user_id, title=title, url=url, icon_url=icon_url)
            db.session.add(new_link)
            db.session.commit()
            return jsonify({"status": "success", "link": {"id": new_link.entry_id, "title": new_link.title, "url": new_link.url, "icon_url": new_link.icon_url}}), 201
        except Exception as e:
            db.session.rollback()
            return jsonify({"status": "error", "message": f"링크 추가 중 오류 발생: {e}"}), 500

@app.route('/api/quick-links/<int:link_id>', methods=['DELETE'])
@login_required
def delete_quick_link(link_id):
    user_id = session['student_id']
    link = db.session.get(QuickLink, link_id)
    if not link or link.user_id != user_id:
        return jsonify({"status": "error", "message": "링크를 찾을 수 없거나 권한이 없습니다."}), 404
    try:
        db.session.delete(link)
        db.session.commit()
        return jsonify({"status": "success", "message": "링크가 삭제되었습니다."})
    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "message": f"링크 삭제 중 오류 발생: {e}"}), 500

@app.route('/api/credits/goal', methods=['POST'])
@login_required
def update_credit_goal():
    data = request.json
    new_goal = data.get('goal', type=int)
    user_id = session['student_id']
    if new_goal is None or new_goal <= 0: return jsonify({"status": "error", "message": "유효하지 않은 학점입니다."}), 400
    try:
        user = db.session.get(User, user_id)
        user.total_credits_goal = new_goal
        db.session.commit()
        return jsonify({"status": "success", "message": "목표 학점이 업데이트되었습니다.", "new_goal": new_goal})
    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "message": f"업데이트 중 오류 발생: {e}"}), 500

if __name__ == '__main__':
    scheduler = BackgroundScheduler()
    scheduler.add_job(manage_semesters_job, 'cron', month=12, day=1, hour=3)
    scheduler.start()
    print("Scheduler started... Press Ctrl+C to exit")
    
    atexit.register(lambda: scheduler.shutdown())
    
    app.run(debug=True, port=2424)