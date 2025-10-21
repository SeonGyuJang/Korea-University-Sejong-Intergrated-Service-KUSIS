from flask import Flask, render_template, jsonify, request, redirect, url_for, session, flash
from datetime import datetime, timedelta, date
import json # json 임포트 확인
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

# --- (유지) Flask CLI 명령어 (최초 DB 생성용) ---
@app.cli.command("init-db")
def init_db_command():
    """Creates the database tables and initial data."""
    create_initial_data()
    print("Database initialized.")


# --- File Paths ---
BUS_TIME_PATH = os.path.join(os.path.dirname(__file__), 'schedules', 'bus_time.csv')
STUDENT_MENU_PATH = os.path.join(os.path.dirname(__file__), 'menu_data', 'student_menu.json')
STAFF_MENU_PATH = os.path.join(os.path.dirname(__file__), 'menu_data', 'staff_menu.json')
CALENDAR_PATH = os.path.join(os.path.dirname(__file__), 'schedules', 'Calendar.csv') # 학사일정 경로 추가


# --- Data Structures for Users/Admin ---
COLLEGES = {
    "과학기술대학": ["응용수리과학부 데이터계산과학전공", "인공지능사이버보안학과", "컴퓨터융합소프트웨어학과", "전자및정보공학과", "전자기계융합공학과", "환경시스템공학과", "지능형반도체공학과", "반도체물리학부", "생명정보공학과", "신소재화학과", "식품생명공학과", "미래모빌리티학과", "디지털헬스케어공학과", "자유공학부"],
    "글로벌비즈니스대학": ["글로벌학부 한국학전공", "글로벌학부 중국학전공", "글로벌학부 영미학전공", "글로벌학부 독일학전공", "융합경영학부 글로벌경영전공", "융합경영학부 디지털경영전공", "표준지식학과"],
    "공공정책대학": ["정부행정학부", "공공사회통일외교학부 공공사회학전공", "공공사회통일외교학부 통일외교안보전공", "경제통계학부 경제정책학전공", "빅데이터사이언스학부"],
    "문화스포츠대학": ["국제스포츠학부 스포츠과학전공", "국제스포츠학부 스포츠비즈니스전공", "문화유산융합학부", "문화창의학부 미디어문예창작전공", "문화창의학부 문화콘텐츠전공"],
    "약학대학": ["약학과", "첨단융합신약학과"],
    "스마트도시학부": ["스마트도시학부"]
}

# --- Database Models (WeeklyMemo 추가) ---

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
    name = db.Column(db.String(100), nullable=False) # 예: "2024년 1학기"
    year = db.Column(db.Integer, nullable=False) # 예: 2024
    season = db.Column(db.String(50), nullable=False) # 예: "1학기", "여름학기", "2학기"
    start_date = db.Column(db.Date) # 학기 시작일 추가
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
    day_of_week = db.Column(db.Integer, nullable=False) # 1:월, 2:화, ... 5:금
    start_time = db.Column(db.String(5), nullable=False) # 예: "09:00"
    end_time = db.Column(db.String(5), nullable=False) # 예: "10:15"
    room = db.Column(db.String(50))

class WeeklyMemo(db.Model):
    __tablename__ = 'weekly_memos'
    id = db.Column(db.Integer, primary_key=True)
    subject_id = db.Column(db.Integer, db.ForeignKey('subjects.id'), nullable=False)
    week_number = db.Column(db.Integer, nullable=False)
    note = db.Column(db.Text, default="")
    todos = db.Column(db.Text, default=json.dumps([])) # JSON 배열을 문자열로 저장
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

# --- 학사일정 로드 함수 ---
def load_academic_calendar():
    calendar_data = {}
    try:
        with open(CALENDAR_PATH, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            next(reader, None) # 헤더 건너뛰기 (필요시)
            for row in reader:
                if len(row) >= 4:
                    year, month, day, event_name = row[0:4]
                    try:
                        event_date = date(int(year), int(month), int(day))
                        # "개강" 이벤트 찾기
                        if "개강" in event_name:
                            semester_key = f"{year}-{month.zfill(2)}" # 예: "2025-03"
                            if semester_key not in calendar_data or event_date < calendar_data[semester_key]:
                                calendar_data[semester_key] = event_date
                    except ValueError:
                        continue # 날짜 형식이 잘못된 경우 건너뛰기
    except Exception as e:
        print(f"Error loading academic calendar: {e}")
    return calendar_data

ACADEMIC_CALENDAR = load_academic_calendar()

# --- 학기 시작일 계산 함수 (학사일정 기반) ---
def get_semester_start_date_from_calendar(year, season):
    """학사일정 데이터를 기반으로 학기 시작일을 반환합니다."""
    month_key = ""
    if "1학기" in season:
        month_key = f"{year}-03" # 3월
    elif "2학기" in season:
        month_key = f"{year}-09" # 9월
    elif "여름학기" in season:
        month_key = f"{year}-06" # 6월 (대략)
    elif "겨울학기" in season:
        month_key = f"{year}-12" # 12월 (대략)

    # 가장 가까운 '개강' 날짜 찾기 (여름/겨울은 추정)
    start_date = ACADEMIC_CALENDAR.get(month_key)
    if start_date:
        return start_date

    # 학사일정에 없으면 기존 추정 방식 사용
    return _get_semester_start_date_fallback(year, season)

# --- 기존 학기 시작일 추정 함수 (Fallback) ---
def _get_semester_start_date_fallback(year, season):
    """기존 방식대로 학기 시작 날짜를 추정합니다."""
    if "1학기" in season:
        return date(year, 3, 1) # 3월 1일 근처
    elif "2학기" in season:
        return date(year, 9, 1) # 9월 1일 근처
    elif "여름학기" in season:
        return date(year, 6, 20) # 6월 말
    elif "겨울학기" in season:
        return date(year, 12, 20) # 12월 말
    return date(year, 1, 1)


# --- (유지) 학기 생성 로직 (2020-2025년) ---
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
                start_date = get_semester_start_date_from_calendar(year, season) # 시작일 계산
                new_semester = Semester(
                    user_id=user_id,
                    name=semester_name,
                    year=year,
                    season=season,
                    start_date=start_date # 시작일 저장
                )
                db.session.add(new_semester)
    db.session.commit()

# --- [MODIFIED] 학기 자동 관리 스케줄 작업 ---
def manage_semesters_job():
    """
    매년 12월 1일에 실행되는 학기 관리 작업.
    1. 다음 연도 학기(1,여름,2,겨울)를 모든 사용자에게 추가합니다.
    2. (수정) 사용자의 학기 중 '가장 오래된 연도'의 학기(Subject가 없는)를 삭제합니다.
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
                # 1. 다음 연도 학기 추가 (유지)
                for season in seasons:
                    semester_name = f"{next_year}년 {season}"
                    exists = Semester.query.filter_by(user_id=user.id, name=semester_name).first()
                    if not exists:
                        start_date = get_semester_start_date_from_calendar(next_year, season) # 시작일 계산
                        new_semester = Semester(
                            user_id=user.id,
                            name=semester_name,
                            year=next_year,
                            season=season,
                            start_date=start_date # 시작일 저장
                        )
                        db.session.add(new_semester)
                        print(f"Added {semester_name} for user {user.id}")

                # 2. (수정) 가장 오래된 연도를 찾아 빈 학기 삭제 (Req #2, #3)
                # 가장 오래된 학기를 찾아 그 연도를 확인
                oldest_semester = Semester.query.filter_by(user_id=user.id).order_by(Semester.year.asc()).first()
                if not oldest_semester:
                    continue # 이 사용자는 학기가 없으므로 건너뜀

                oldest_year = oldest_semester.year
                print(f"Checking oldest year {oldest_year} for user {user.id}")

                # 가장 오래된 연도의 모든 학기를 가져옴
                oldest_year_semesters = Semester.query.filter_by(user_id=user.id, year=oldest_year).all()

                for semester in oldest_year_semesters:
                    # 이 학기에 연결된 과목이 있는지 확인
                    has_subjects = Subject.query.filter_by(semester_id=semester.id).first()
                    if not has_subjects:
                        # (Req #3) 과목이 없으면 삭제
                        db.session.delete(semester)
                        print(f"Deleted oldest empty semester {semester.name} for user {user.id}")
                    else:
                        # (Req #3) 과목이 있으면 유지
                        print(f"Keeping oldest semester {semester.name} (has data) for user {user.id}")

            db.session.commit()
            print("Semester management job completed successfully.")
        except Exception as e:
            db.session.rollback()
            print(f"Error in semester management job: {e}")

# --- DB 초기화 (유지) ---
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
            _create_semesters_for_user(admin_id) # (유지) 2020-2025 학기 생성

        # 샘플 유저 생성 및 학기 추가, 샘플 데이터 추가
        if not db.session.get(User, sample_user_id):
            sample_user = User(name="장선규", id=sample_user_id, dob="2004-03-24", college="과학기술대학", department="컴퓨터융합소프트웨어학과", password_hash=generate_password_hash("password123"), is_admin=False)
            db.session.add(sample_user)
            db.session.commit()
            _create_semesters_for_user(sample_user_id) # (유지) 2020-2025 학기 생성

            # --- 샘플 데이터 추가 (2025년 2학기에) ---
            sample_semester = Semester.query.filter_by(user_id=sample_user_id, name="2025년 2학기").first()
            if sample_semester:
                # [수정] Subject.memo는 과목 전체 메모로 유지
                web_memo = json.dumps({"note": "과제 제출 기한 엄수! (과목 전체 메모)", "todos": [{"task": "Flask 라우팅 공부", "done": False}]})
                s1 = Subject(user_id=sample_user_id, semester_id=sample_semester.id, name="웹프로그래밍", professor="최교수", credits=3, memo=web_memo)
                s2 = Subject(user_id=sample_user_id, semester_id=sample_semester.id, name="데이터베이스", professor="김교수", credits=3)
                db.session.add_all([s1, s2])
                db.session.commit() # s1, s2 ID 생성을 위해 커밋
                # ID 생성 후 TimeSlot 및 WeeklyMemo 추가
                db.session.add(TimeSlot(subject_id=s1.id, day_of_week=1, start_time="10:00", end_time="11:15", room="창의관 101"))
                db.session.add(TimeSlot(subject_id=s1.id, day_of_week=3, start_time="10:00", end_time="11:15", room="창의관 101"))
                db.session.add(TimeSlot(subject_id=s2.id, day_of_week=2, start_time="13:30", end_time="14:45", room="세종관 205"))
                db.session.add(TimeSlot(subject_id=s2.id, day_of_week=4, start_time="13:30", end_time="14:45", room="세종관 205"))

                # [신규] 샘플 주차별 메모 추가
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
                db.session.commit() # TimeSlot, WeeklyMemo 커밋

            # --- 샘플 퀵링크/일정 ---
            QuickLink.query.filter_by(user_id=sample_user_id).delete() # 기존 샘플 퀵링크 삭제
            db.session.add_all([
                QuickLink(user_id=sample_user_id, title="네이버", url="https://www.naver.com", icon_url="fa-solid fa-n"),
                QuickLink(user_id=sample_user_id, title="LMS", url="https://lms.korea.ac.kr", icon_url="fa-solid fa-book"),
            ])
            # --- 샘플 Schedule 추가 ---
            Schedule.query.filter_by(user_id=sample_user_id, date=datetime.now().strftime('%Y-%m-%d')).delete() # 오늘 날짜 샘플 일정 삭제
            db.session.add(Schedule(user_id=sample_user_id, date=datetime.now().strftime('%Y-%m-%d'), time="15:00", title="팀 프로젝트 회의", location="스터디룸 3"))
            db.session.commit()


# --- Authentication Decorators (변경 없음) ---
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

# --- 데이터 로드 및 정제 함수 (변경 없음) ---
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

                # 노트에 '오송역'이 포함되어 있으면 경로 텍스트와 그룹 변경
                route_group = "Jochiwon" # 기본값
                if '오송역' in note or route.endswith('Osong'):
                    route_group = "Osong_Included"
                    if route == 'Station_to_School': route_kr = '조치원/오송역 → 학교 (경유)'
                    elif route == 'School_to_Station': route_kr = '학교 → 조치원역/오송역 (경유)'

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
        data = {'student': {}, 'faculty': {}, 'student_period': {}, 'faculty_period': {}} # period 키 추가
    return data

def get_today_meal_key():
    today = datetime.now()
    day_of_week_kr = ['월', '화', '수', '목', '금', '토', '일'][today.weekday()]
    return f"{today.month}.{today.day}({day_of_week_kr})"

# menu_to_string 함수 수정 (숫자 제거 추가)
def menu_to_string(menu_list):
    if not menu_list:
        return ""
    # kcal 제거, 숫자 제거, 공백 제거, 괄호 내용 제거
    cleaned_menu = [item.strip() for item in menu_list if item and not item.lower().endswith('kcal') and not item.isdigit() and 'kcal' not in item.lower()]
    cleaned_menu = [item.split('(')[0].strip() for item in cleaned_menu if item.split('(')[0].strip()]
    # 중복 제거 및 정렬
    unique_menu = sorted(list(set(cleaned_menu)))
    return ", ".join(unique_menu)

# format_meal_for_client 함수 수정 (키 이름 직접 사용)
def format_meal_for_client(menu_data, target_date_key, cafeteria_type):
    formatted_menu = {"breakfast": "식단 정보 없음", "lunch": "식단 정보 없음", "dinner": "식단 정보 없음"}
    daily_menu = menu_data.get(target_date_key, {})

    if cafeteria_type == 'student':
        formatted_menu['lunch'] = {'korean': "식단 정보 없음", 'ala_carte': "식단 정보 없음", 'snack_plus': "식단 정보 없음"}
        if '조식' in daily_menu: formatted_menu['breakfast'] = menu_to_string(daily_menu['조식'].get('메뉴', []))
        if '중식-한식' in daily_menu: formatted_menu['lunch']['korean'] = menu_to_string(daily_menu['중식-한식'].get('메뉴', []))

        ala_carte_items = []
        if '중식-일품' in daily_menu:
            ilpum_str = menu_to_string(daily_menu['중식-일품'].get('메뉴', []))
            if ilpum_str: ala_carte_items.append("일품: " + ilpum_str)
        if '중식-분식' in daily_menu:
            bunsik_str = menu_to_string(daily_menu['중식-분식'].get('메뉴', []))
            if bunsik_str: ala_carte_items.append("분식: " + bunsik_str)
        if ala_carte_items: formatted_menu['lunch']['ala_carte'] = " / ".join(ala_carte_items)

        if '중식-plus' in daily_menu: formatted_menu['lunch']['snack_plus'] = menu_to_string(daily_menu['중식-plus'].get('메뉴', []))
        if '석식' in daily_menu: formatted_menu['dinner'] = menu_to_string(daily_menu['석식'].get('메뉴', []))

    elif cafeteria_type == 'faculty':
        formatted_menu['breakfast'] = "조식 제공 없음"
        formatted_menu['dinner'] = "석식 제공 없음"
        # 교직원 식당은 '중식' 키 하나만 있음
        if '중식' in daily_menu: formatted_menu['lunch'] = menu_to_string(daily_menu['중식'].get('메뉴', []))

    return formatted_menu


def format_weekly_meal_for_client(weekly_meal_data):
    formatted_data = {"기간": weekly_meal_data.get('student_period', weekly_meal_data.get('faculty_period', {})), "식단": {}}
    all_date_keys = sorted(set(weekly_meal_data.get('student', {}).keys()).union(set(weekly_meal_data.get('faculty', {}).keys())))
    for cafeteria_type in ['student', 'faculty']:
        formatted_data['식단'][cafeteria_type] = {}
        menu_data = weekly_meal_data.get(cafeteria_type, {})
        for date_key in all_date_keys:
            # 주말 데이터도 포함하여 포맷팅
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
            session.clear() # DB에 없는 사용자면 세션 클리어
    return render_template('index.html', user=user_info, is_admin=is_admin)

@app.route('/timetable-management')
@login_required
def timetable_management():
    user_id = session['student_id']
    user = db.session.get(User, user_id)

    # 이수 학점 계산 (성적 무관 모든 과목)
    all_user_subjects = Subject.query.filter_by(user_id=user_id).all()
    # [수정] Req 4: F, Not Set 제외하고 학점 합산
    total_earned_credits = sum(subject.credits for subject in all_user_subjects if subject.grade and subject.grade not in ['F', 'Not Set'])

    # GPA 계산 (성적 있는 과목만, P/F 과목 제외)
    GRADE_MAP = {"A+": 4.5, "A0": 4.0, "B+": 3.5, "B0": 3.0, "C+": 2.5, "C0": 2.0, "D+": 1.5, "D0": 1.0, "F": 0.0}
    total_gpa_credits = 0
    total_gpa_score = 0
    for subject in all_user_subjects:
        grade_score = GRADE_MAP.get(subject.grade)
        if grade_score is not None: # P 제외됨
            total_gpa_credits += subject.credits
            total_gpa_score += (grade_score * subject.credits)
    overall_gpa = (total_gpa_score / total_gpa_credits) if total_gpa_credits > 0 else 0.0

    return render_template(
        'timetable_management.html',
        user=user,
        is_admin=user.is_admin if user else False,
        current_credits=total_earned_credits,
        goal_credits=user.total_credits_goal if user else 130,
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
            session.permanent = True # Use permanent session
            app.permanent_session_lifetime = timedelta(hours=1) # Set lifetime
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

            _create_semesters_for_user(new_user.id) # (유지) 회원가입 후 2020-2025 학기 생성

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
    # 관리자/사용자 구분하여 정렬
    member_list = sorted(
        [{"id": user.id, "name": user.name, "department": user.department, "is_admin": user.is_admin} for user in all_users],
        key=lambda x: (not x['is_admin'], x['id']) # 관리자 우선, 다음 학번순
    )
    return render_template('admin.html', member_count=member_count, member_list=member_list)

# --- Public API Endpoints (변경 없음) ---
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
# [수정] Req 1: 시간표 정보 포함하여 오늘의 일정 반환
@app.route('/api/schedule', methods=['GET'])
@login_required
def get_schedule():
    user_id = session['student_id']
    today = datetime.now()
    today_str = today.strftime('%Y-%m-%d')
    # Python weekday(): Monday is 0 and Sunday is 6
    # DB day_of_week: Monday is 1 and Friday is 5
    today_day_of_week = today.weekday() + 1 # Convert to 1-5 range

    schedule_list = []

    # 1. DB에 저장된 사용자 정의 일정 가져오기
    user_schedules = Schedule.query.filter_by(user_id=user_id, date=today_str).all()
    for s in user_schedules:
        schedule_list.append({"type": "schedule", "time": s.time, "title": s.title, "location": s.location})

    # 2. 오늘 요일의 시간표 가져오기
    # 현재 학기 찾기 (get_timetable_data 로직 일부 재사용)
    current_semester = None
    all_semesters = Semester.query.filter_by(user_id=user_id).order_by(Semester.year.desc()).all()
    if all_semesters:
        current_found = False
        today_date_obj = today.date() # date 객체로 비교
        for s in all_semesters:
            start = s.start_date if s.start_date else _get_semester_start_date_fallback(s.year, s.season)
            # 종료일은 대략적으로 계산 (정확한 학기 종료일 DB 필요)
            if "1학기" in s.season and date(s.year, 3, 1) <= today_date_obj <= date(s.year, 6, 30):
                current_semester = s; current_found = True; break
            elif "여름학기" in s.season and date(s.year, 6, 15) <= today_date_obj <= date(s.year, 7, 31):
                current_semester = s; current_found = True; break
            elif "2학기" in s.season and date(s.year, 9, 1) <= today_date_obj <= date(s.year, 12, 31):
                current_semester = s; current_found = True; break
            elif "겨울학기" in s.season and (date(s.year, 12, 15) <= today_date_obj <= date(s.year, 12, 31) or \
                                           date(s.year + 1, 1, 1) <= today_date_obj <= date(s.year + 1, 1, 31)):
                current_semester = s; current_found = True; break
        if not current_found: # 못찾으면 최신 학기
             season_order = {"1학기": 1, "여름학기": 2, "2학기": 3, "겨울학기": 4}
             all_semesters.sort(key=lambda sem: (sem.year, season_order.get(sem.season, 99)), reverse=True)
             current_semester = all_semesters[0]

    # 현재 학기의 오늘 요일 수업 찾기
    if current_semester and 1 <= today_day_of_week <= 5: # 월요일~금요일
        today_subjects = Subject.query \
            .join(TimeSlot) \
            .filter(Subject.semester_id == current_semester.id) \
            .filter(TimeSlot.day_of_week == today_day_of_week) \
            .all()
        for subject in today_subjects:
            # 해당 요일의 모든 시간 슬롯 찾기 (한 과목이 하루에 여러 번 있을 수 있음)
            subject_timeslots_today = [ts for ts in subject.timeslots if ts.day_of_week == today_day_of_week]
            for ts in subject_timeslots_today:
                schedule_list.append({
                    "type": "class", # 구분자 추가
                    "time": ts.start_time,
                    "title": subject.name,
                    "location": ts.room
                })

    # 3. 시간순으로 정렬
    schedule_list.sort(key=lambda x: x['time'])

    return jsonify(schedule_list)

# [신규] Req 3: 일정 추가 API 엔드포인트
@app.route('/api/schedule/add', methods=['POST'])
@login_required
def add_schedule():
    user_id = session['student_id']
    data = request.json
    s_date = data.get('date')
    s_time = data.get('time')
    s_title = data.get('title')
    s_location = data.get('location')

    # 기본 유효성 검사
    if not all([s_date, s_time, s_title]):
        return jsonify({"status": "error", "message": "날짜, 시간, 일정 내용은 필수입니다."}), 400

    # 날짜 및 시간 형식 검사 (간단하게)
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
        # 추가된 일정 정보 반환 (ID 포함)
        return jsonify({
            "status": "success",
            "message": "일정이 추가되었습니다.",
            "schedule": {
                "id": new_schedule.entry_id,
                "type": "schedule", # 프론트엔드 구분을 위해
                "date": new_schedule.date,
                "time": new_schedule.time,
                "title": new_schedule.title,
                "location": new_schedule.location
            }
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "message": f"일정 추가 중 오류 발생: {e}"}), 500

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


# [수정됨] 요구사항 2: 현재 날짜 기준 학기 반환 로직 추가
@app.route('/api/timetable-data', methods=['GET'])
@login_required
def get_timetable_data():
    user_id = session['student_id']
    semester_id_str = request.args.get('semester_id')
    semester = None

    if semester_id_str:
        try:
            semester = db.session.get(Semester, int(semester_id_str))
            # 요청된 학기가 사용자의 학기가 맞는지 확인
            if semester and semester.user_id != user_id:
                semester = None # 권한 없음
        except ValueError:
            semester = None # 잘못된 ID 형식
    else:
        # semester_id가 없으면 현재 날짜 기준으로 학기 찾기
        today = date.today()
        # 사용자의 모든 학기 가져오기
        all_semesters = Semester.query.filter_by(user_id=user_id).order_by(Semester.year.desc()).all()

        if all_semesters:
            current_found = False
            # 정의된 학기 기간에 따라 현재 학기 찾기
            for s in all_semesters:
                year = s.year
                month = today.month
                day = today.day
                current_month_day = (month, day)

                # 날짜 비교를 위해 (월, 일) 튜플 생성
                # 1학기 : 3.4 - 6.23
                if s.season == "1학기" and (3, 4) <= current_month_day <= (6, 23):
                    semester = s
                    current_found = True
                    break
                # 여름 계절 : 6.24 - 7.21
                elif s.season == "여름학기" and (6, 24) <= current_month_day <= (7, 21):
                    semester = s
                    current_found = True
                    break
                # 2학기 : 9.1 - 12.19
                elif s.season == "2학기" and (9, 1) <= current_month_day <= (12, 19):
                    semester = s
                    current_found = True
                    break
                # 겨울 계절 : 12.22 - 1.17
                elif s.season == "겨울학기" and ((12, 22) <= current_month_day <= (12, 31) or (1, 1) <= current_month_day <= (1, 17)):
                    semester = s
                    current_found = True
                    break

            # 현재 날짜에 해당하는 학기를 찾지 못하면 최신 학기로 설정
            if not current_found:
                 season_order = {"1학기": 1, "여름학기": 2, "2학기": 3, "겨울학기": 4}
                 all_semesters.sort(key=lambda s: (s.year, season_order.get(s.season, 99)), reverse=True)
                 semester = all_semesters[0] # 정렬된 목록의 첫 번째 (최신)

    if not semester:
        return jsonify({"semester": None, "subjects": []}), 404 # 학기를 찾을 수 없음

    # 선택된 학기의 과목 정보 조회
    subjects = Subject.query.filter_by(user_id=user_id, semester_id=semester.id).all()
    result = []
    for s in subjects:
        timeslots_data = [{"id": ts.id, "day": ts.day_of_week, "start": ts.start_time, "end": ts.end_time, "room": ts.room} for ts in s.timeslots]
        try:
            # 메모가 비어있거나 None일 경우 기본값 사용
            memo_data = json.loads(s.memo) if s.memo and s.memo.strip() else {"note": "", "todos": []}
        except (json.JSONDecodeError, TypeError):
            memo_data = {"note": "", "todos": []} # 파싱 실패 시 기본값
        result.append({"id": s.id, "name": s.name, "professor": s.professor, "credits": s.credits, "grade": s.grade, "memo": memo_data, "timeslots": timeslots_data})

    # 학기 정보 포함하여 반환
    semester_info = {
        "id": semester.id,
        "name": semester.name,
        "year": semester.year,
        "season": semester.season,
        "start_date": semester.start_date.isoformat() if semester.start_date else None # 시작일 추가
    }
    return jsonify({"semester": semester_info, "subjects": result})


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
            memo=json.dumps({"note": "", "todos": []}) # 기본 메모 구조
        )
        db.session.add(new_subject)
        db.session.flush() # ID 생성을 위해 flush

        for ts_data in data.get('timeslots', []):
             # 시간 데이터 유효성 검사 추가
             if ts_data.get('day') and ts_data.get('start') and ts_data.get('end'):
                db.session.add(TimeSlot(
                    subject_id=new_subject.id, day_of_week=ts_data.get('day'),
                    start_time=ts_data.get('start'), end_time=ts_data.get('end'), room=ts_data.get('room')
                ))
        db.session.commit()

        # 생성된 과목 정보 반환 시 메모 파싱
        created_memo = json.loads(new_subject.memo)
        created_subject_data = {
            "id": new_subject.id, "name": new_subject.name, "professor": new_subject.professor,
            "credits": new_subject.credits, "grade": new_subject.grade,
            "memo": created_memo, # 파싱된 메모
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

            # 메모 업데이트 (딕셔너리 형태일 때만 JSON 문자열로 변환)
            if 'memo' in data and isinstance(data.get('memo'), dict):
                subject.memo = json.dumps(data['memo'])
            elif 'memo' not in data:
                 # 요청에 memo가 없으면 기존 값 유지 (또는 기본값 설정)
                 if not subject.memo:
                     subject.memo = json.dumps({"note": "", "todos": []})
            # else: memo 형식 오류 시 무시하고 기존 값 유지

            # 기존 TimeSlot 삭제 후 새로 추가
            TimeSlot.query.filter_by(subject_id=subject.id).delete()
            for ts_data in data.get('timeslots', []):
                 # 시간 데이터 유효성 검사 추가
                 if ts_data.get('day') and ts_data.get('start') and ts_data.get('end'):
                    db.session.add(TimeSlot(
                        subject_id=subject.id, day_of_week=ts_data.get('day'),
                        start_time=ts_data.get('start'), end_time=ts_data.get('end'), room=ts_data.get('room')
                    ))
            db.session.commit()

            # 업데이트된 과목 정보 반환 시 메모 파싱
            updated_memo = json.loads(subject.memo) if subject.memo else {"note": "", "todos": []}
            updated_subject_data = {
                "id": subject.id, "name": subject.name, "professor": subject.professor,
                "credits": subject.credits, "grade": subject.grade,
                "memo": updated_memo, # 파싱된 메모
                "timeslots": [{"id": ts.id, "day": ts.day_of_week, "start": ts.start_time, "end": ts.end_time, "room": ts.room} for ts in subject.timeslots]
            }
            return jsonify({"status": "success", "message": "과목이 수정되었습니다.", "subject": updated_subject_data})
        except Exception as e:
            db.session.rollback()
            return jsonify({"status": "error", "message": f"과목 수정 중 오류 발생: {e}"}), 500

    if request.method == 'DELETE':
        try:
            # 관련된 WeeklyMemo 먼저 삭제
            WeeklyMemo.query.filter_by(subject_id=subject.id).delete()
            # 관련된 TimeSlot 삭제 (cascade 설정으로 자동 삭제될 수도 있지만 명시적 삭제)
            TimeSlot.query.filter_by(subject_id=subject.id).delete()
            # 과목 삭제
            db.session.delete(subject)
            db.session.commit()
            return jsonify({"status": "success", "message": "과목 및 관련 데이터가 삭제되었습니다."})
        except Exception as e:
            db.session.rollback()
            return jsonify({"status": "error", "message": f"과목 삭제 중 오류 발생: {e}"}), 500


# --- [신규] 주차별 메모/Todo API (Req #1, #6) ---
@app.route('/api/subjects/<int:subject_id>/week/<int:week_number>', methods=['GET'])
@login_required
def get_weekly_memo(subject_id, week_number):
    user_id = session['student_id']
    subject = db.session.get(Subject, subject_id)

    if not subject or subject.user_id != user_id:
        return jsonify({"status": "error", "message": "과목을 찾을 수 없거나 권한이 없습니다."}), 404

    try:
        semester = subject.semester
        semester_start_date = semester.start_date if semester.start_date else get_semester_start_date_from_calendar(semester.year, semester.season) # DB 또는 계산

        week_date_str = f"{week_number}주차" # 기본값
        if semester_start_date:
            try:
                week_start_date = semester_start_date + timedelta(weeks=(week_number - 1))
                week_end_date = week_start_date + timedelta(days=6)
                week_date_str = f"{week_start_date.strftime('%m.%d')} ~ {week_end_date.strftime('%m.%d')}"
            except OverflowError: # 날짜 계산 중 에러 발생 시 기본값 사용
                print(f"Date calculation overflow for week {week_number}, semester start: {semester_start_date}")

        weekly_memo = WeeklyMemo.query.filter_by(subject_id=subject.id, week_number=week_number).first()

        note = ""
        todos = []
        if weekly_memo:
            note = weekly_memo.note if weekly_memo.note else ""
            try:
                todos = json.loads(weekly_memo.todos) if weekly_memo.todos and weekly_memo.todos.strip() else []
            except (json.JSONDecodeError, TypeError):
                todos = [] # 파싱 실패 시 빈 리스트

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
            # 메모나 할일이 있을 때만 새로 생성
            if note or todos:
                weekly_memo = WeeklyMemo(subject_id=subject.id, week_number=week_number)
                db.session.add(weekly_memo)
            else:
                 # 내용이 없으면 저장할 필요 없음
                 return jsonify({"status": "success", "message": "저장할 내용이 없습니다."})


        weekly_memo.note = note
        weekly_memo.todos = json.dumps(todos)

        db.session.commit()

        # 저장된 데이터 다시 로드하여 반환 (파싱 포함)
        saved_todos = json.loads(weekly_memo.todos) if weekly_memo.todos else []
        return jsonify({
            "status": "success",
            "message": f"{week_number}주차 정보가 저장되었습니다.",
            "data": {
                "week_number": week_number,
                "note": weekly_memo.note,
                "todos": saved_todos
            }
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "message": f"주차별 정보 저장 중 오류: {e}"}), 500

# [신규] 모든 주차 정보 모아보기 API (Req #4)
@app.route('/api/subjects/<int:subject_id>/all-weeks', methods=['GET'])
@login_required
def get_all_weekly_memos(subject_id):
    user_id = session['student_id']
    subject = db.session.get(Subject, subject_id)

    if not subject or subject.user_id != user_id:
        return jsonify({"status": "error", "message": "과목을 찾을 수 없거나 권한이 없습니다."}), 404

    try:
        all_memos = WeeklyMemo.query.filter_by(subject_id=subject.id).order_by(WeeklyMemo.week_number).all()
        memo_dict = {m.week_number: m for m in all_memos} # 주차 번호를 키로 하는 딕셔너리

        semester = subject.semester
        semester_start_date = semester.start_date if semester.start_date else get_semester_start_date_from_calendar(semester.year, semester.season) # DB 또는 계산

        result = []
        for week_num in range(1, 17): # 1주차부터 16주차까지
            date_range = f"{week_num}주차"
            if semester_start_date:
                try:
                    week_start = semester_start_date + timedelta(weeks=(week_num - 1))
                    week_end = week_start + timedelta(days=6)
                    date_range = f"{week_start.strftime('%m.%d')} ~ {week_end.strftime('%m.%d')}"
                except OverflowError:
                    pass # 날짜 계산 오류 시 기본값 사용

            memo_data = memo_dict.get(week_num) # 딕셔너리에서 조회

            note = ""
            todos = []
            if memo_data:
                note = memo_data.note if memo_data.note else ""
                try:
                    todos = json.loads(memo_data.todos) if memo_data.todos and memo_data.todos.strip() else []
                except (json.JSONDecodeError, TypeError):
                    todos = []

            result.append({
                "week_number": week_num,
                "date_range": date_range,
                "note": note,
                "todos": todos
            })

        return jsonify({"status": "success", "subject_name": subject.name, "data": result})
    except Exception as e:
        print(f"Error in get_all_weekly_memos: {e}") # 에러 로깅 추가
        return jsonify({"status": "error", "message": f"전체 주차 정보 로드 중 오류: {e}"}), 500


@app.route('/api/gpa-stats', methods=['GET'])
@login_required
def get_gpa_stats():
    user_id = session['student_id']
    semesters = Semester.query.filter_by(user_id=user_id).all()

    season_order = {"1학기": 1, "여름학기": 2, "2학기": 3, "겨울학기": 4}
    semesters.sort(key=lambda s: (s.year, season_order.get(s.season, 99)))

    stats = []
    GRADE_MAP = {"A+": 4.5, "A0": 4.0, "B+": 3.5, "B0": 3.0, "C+": 2.5, "C0": 2.0, "D+": 1.5, "D0": 1.0, "F": 0.0}

    for semester in semesters:
        subjects = semester.subjects
        semester_gpa_credits, semester_gpa_score = 0, 0
        for subject in subjects:
            grade_score = GRADE_MAP.get(subject.grade)
            if grade_score is not None: # P/F 제외
                semester_gpa_credits += subject.credits
                semester_gpa_score += (grade_score * subject.credits)

        if semester_gpa_credits > 0:
            semester_gpa = (semester_gpa_score / semester_gpa_credits)
            stats.append({"semester_name": semester.name, "gpa": round(semester_gpa, 2)})

    all_subjects = Subject.query.filter_by(user_id=user_id).all()
    # 이수 학점: F, Not Set 제외
    total_earned_credits = sum(s.credits for s in all_subjects if s.grade and s.grade not in ['F', 'Not Set'])

    # 전체 GPA: F 포함, P/F, Not Set 제외
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
    today = datetime.now().date() # 날짜만 사용
    today_str = today.strftime('%Y-%m-%d')
    today_log = StudyLog.query.filter_by(user_id=user_id, date=today_str).first()
    today_seconds = today_log.duration_seconds if today_log else 0

    # 최근 7일(오늘 포함) 데이터 조회
    seven_days_ago = today - timedelta(days=6)
    seven_days_ago_str = seven_days_ago.strftime('%Y-%m-%d')
    weekly_logs = StudyLog.query.filter(
        StudyLog.user_id == user_id,
        StudyLog.date >= seven_days_ago_str,
        StudyLog.date <= today_str
    ).all()

    total_seconds = sum(log.duration_seconds for log in weekly_logs)
    # 평균 계산 시 실제 로그가 있는 날짜 수로 나눌 수도 있으나, 여기서는 7일 평균 유지
    weekly_avg_seconds = total_seconds / 7

    return jsonify({"today": today_seconds, "weekly_avg": weekly_avg_seconds})

@app.route('/api/study-time', methods=['POST'])
@login_required
def save_study_time():
    data = request.json
    duration_to_add = data.get('duration_to_add')
    date_str = data.get('date')
    user_id = session['student_id']
    if not isinstance(duration_to_add, int) or duration_to_add < 0 or not date_str: # 음수 방지
        return jsonify({"status": "error", "message": "잘못된 요청입니다."}), 400
    try:
        # 날짜 형식 검증
        datetime.strptime(date_str, '%Y-%m-%d')

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
        # URL 유효성 검사 강화 (기본 스키마 추가)
        if not url.startswith(('http://', 'https://')):
             url = 'https://' + url
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
        if not user: # 사용자 존재 확인
             return jsonify({"status": "error", "message": "사용자를 찾을 수 없습니다."}), 404
        user.total_credits_goal = new_goal
        db.session.commit()
        return jsonify({"status": "success", "message": "목표 학점이 업데이트되었습니다.", "new_goal": new_goal})
    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "message": f"업데이트 중 오류 발생: {e}"}), 500

if __name__ == '__main__':
    # 학사일정 로드 확인
    # print("Loaded Academic Calendar:", ACADEMIC_CALENDAR)

    scheduler = BackgroundScheduler()
    # 매년 12월 1일 새벽 3시에 실행
    scheduler.add_job(manage_semesters_job, 'cron', month=12, day=1, hour=3, id='semester_management_job') # Job ID 추가
    # 애플리케이션 시작 시에도 한 번 실행 (선택적)
    # scheduler.add_job(manage_semesters_job, 'date', run_date=datetime.now() + timedelta(seconds=5))
    scheduler.start()
    print("Scheduler started... Press Ctrl+C to exit")

    # 애플리케이션 종료 시 스케줄러 종료
    atexit.register(lambda: scheduler.shutdown())

    # 디버그 모드 비활성화 및 포트 변경하여 실행 (실제 배포 시 고려)
    # app.run(debug=False, port=5000, host='0.0.0.0')
    app.run(debug=True, port=2424) # 개발용 설정 유지