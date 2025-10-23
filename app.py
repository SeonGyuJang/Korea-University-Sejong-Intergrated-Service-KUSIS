# app.py
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
from sqlalchemy import inspect, func, cast, Date as SQLDate # DB 테이블 존재 여부 확인 및 날짜 계산 위해 임포트

load_dotenv()

app = Flask(__name__)

# --- Configuration (기존 유지) ---
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

# --- Flask CLI 명령어 (기존 유지) ---
@app.cli.command("init-db")
def init_db_command():
    """Creates the database tables and initial data."""
    with app.app_context():
        create_initial_data()
    print("Database initialized.")


# --- File Paths (기존 유지) ---
BUS_TIME_PATH = os.path.join(os.path.dirname(__file__), 'schedules', 'bus_time.csv')
STUDENT_MENU_PATH = os.path.join(os.path.dirname(__file__), 'menu_data', 'student_menu.json')
STAFF_MENU_PATH = os.path.join(os.path.dirname(__file__), 'menu_data', 'staff_menu.json')
CALENDAR_PATH = os.path.join(os.path.dirname(__file__), 'schedules', 'Calendar.csv')


# --- Data Structures for Users/Admin (기존 유지) ---
COLLEGES = {
    "과학기술대학": ["응용수리과학부 데이터계산과학전공", "인공지능사이버보안학과", "컴퓨터융합소프트웨어학과", "전자및정보공학과", "전자기계융합공학과", "환경시스템공학과", "지능형반도체공학과", "반도체물리학부", "생명정보공학과", "신소재화학과", "식품생명공학과", "미래모빌리티학과", "디지털헬스케어공학과", "자유공학부"],
    "글로벌비즈니스대학": ["글로벌학부 한국학전공", "글로벌학부 중국학전공", "글로벌학부 영미학전공", "글로벌학부 독일학전공", "융합경영학부 글로벌경영전공", "융합경영학부 디지털경영전공", "표준지식학과"],
    "공공정책대학": ["정부행정학부", "공공사회통일외교학부 공공사회학전공", "공공사회통일외교학부 통일외교안보전공", "경제통계학부 경제정책학전공", "빅데이터사이언스학부"],
    "문화스포츠대학": ["국제스포츠학부 스포츠과학전공", "국제스포츠학부 스포츠비즈니스전공", "문화유산융합학부", "문화창의학부 미디어문예창작전공", "문화창의학부 문화콘텐츠전공"],
    "약학대학": ["약학과", "첨단융합신약학과"],
    "스마트도시학부": ["스마트도시학부"]
}

# --- Database Models (기존 유지) ---

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.String(10), primary_key=True)
    name = db.Column(db.String(50), nullable=False)
    dob = db.Column(db.String(10), nullable=False)
    college = db.Column(db.String(100), nullable=False)
    department = db.Column(db.String(100), nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    is_admin = db.Column(db.Boolean, default=False, nullable=False)
    total_credits_goal = db.Column(db.Integer, default=130, nullable=False)

    semesters = db.relationship('Semester', backref='user', lazy=True, cascade="all, delete-orphan")
    subjects = db.relationship('Subject', backref='user', lazy=True, cascade="all, delete-orphan")
    schedules = db.relationship('Schedule', backref='user', lazy=True, cascade="all, delete-orphan")
    study_logs = db.relationship('StudyLog', backref='user', lazy=True, cascade="all, delete-orphan")
    todos = db.relationship('Todo', backref='user', lazy=True, cascade="all, delete-orphan") # 독립 Todo 유지


class Semester(db.Model):
    __tablename__ = 'semesters'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(10), db.ForeignKey('users.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False) # 예: "2024년 1학기"
    year = db.Column(db.Integer, nullable=False) # 예: 2024
    season = db.Column(db.String(50), nullable=False) # 예: "1학기", "여름학기", "2학기"
    start_date = db.Column(db.Date) # 학기 시작일 추가
    subjects = db.relationship('Subject', backref='semester', lazy=True, cascade="all, delete-orphan")
    todos = db.relationship('Todo', backref='semester', lazy=True, cascade="all, delete-orphan") # 독립 Todo 유지
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
    timeslots = db.relationship('TimeSlot', backref='subject', lazy=True, cascade="all, delete-orphan")
    daily_memos = db.relationship('DailyMemo', backref='subject', lazy=True, cascade="all, delete-orphan")

class TimeSlot(db.Model):
    __tablename__ = 'timeslots'
    id = db.Column(db.Integer, primary_key=True)
    subject_id = db.Column(db.Integer, db.ForeignKey('subjects.id'), nullable=False)
    day_of_week = db.Column(db.Integer, nullable=False) # 1:월, 2:화, ... 5:금
    start_time = db.Column(db.String(5), nullable=False) # 예: "09:00"
    end_time = db.Column(db.String(5), nullable=False) # 예: "10:15"
    room = db.Column(db.String(50))

class DailyMemo(db.Model):
    __tablename__ = 'daily_memos'
    id = db.Column(db.Integer, primary_key=True)
    subject_id = db.Column(db.Integer, db.ForeignKey('subjects.id'), nullable=False)
    memo_date = db.Column(db.Date, nullable=False) # 메모 날짜 (YYYY-MM-DD)
    note = db.Column(db.Text, default="") # 해당 날짜의 메모 내용
    __table_args__ = (db.UniqueConstraint('subject_id', 'memo_date', name='_subject_date_uc'),)


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
    semester_id = db.Column(db.Integer, db.ForeignKey('semesters.id'), nullable=False) # 학기별로 Todo를 관리
    task = db.Column(db.String(500), nullable=False)
    done = db.Column(db.Boolean, default=False, nullable=False)
    due_date = db.Column(db.Date, nullable=False) # 년-월-일 (요일의 기준이 됨)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'task': self.task,
            'done': self.done,
            'due_date': self.due_date.isoformat(),
            'semester_id': self.semester_id
        }


# --- 학사일정, 학기 시작일 관련 함수 (기존 유지) ---
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

    start_date = ACADEMIC_CALENDAR.get(month_key)
    if start_date:
        return start_date

    return _get_semester_start_date_fallback(year, season)

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


# --- 학기 자동 관리 스케줄 작업 (기존 유지) ---
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
                oldest_semester = Semester.query.filter_by(user_id=user.id).order_by(Semester.year.asc()).first()
                if not oldest_semester:
                    continue # 이 사용자는 학기가 없으므로 건너뜀

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


# --- DB 초기화 (DailyMemo 샘플 추가) ---
def create_initial_data():
    db.create_all()

    admin_id = "9999999999"
    sample_user_id = "2023390822"

    if not db.session.get(User, admin_id):
        print(f"Admin user {admin_id} not found. Creating...")
        admin_user = User(id=admin_id, name="admin", dob="2000-01-01", college="관리자", department="관리팀", password_hash=generate_password_hash("13272441"), is_admin=True)
        db.session.add(admin_user)
        db.session.commit()
        _create_semesters_for_user(admin_id)
        print(f"Admin user {admin_id} created.")
    else:
        print(f"Admin user {admin_id} already exists. Skipping.")

    if not db.session.get(User, sample_user_id):
        print(f"Sample user {sample_user_id} not found. Creating...")
        sample_user = User(name="장선규", id=sample_user_id, dob="2004-06-16", college="개발자", department="ADMIN", password_hash=generate_password_hash("top13272441"), is_admin=False)
        db.session.add(sample_user)
        db.session.commit()
        _create_semesters_for_user(sample_user_id)

        sample_semester = Semester.query.filter_by(user_id=sample_user_id, name="2025년 2학기").first()
        if sample_semester:
            s1 = Subject(user_id=sample_user_id, semester_id=sample_semester.id, name="웹프로그래밍", professor="최교수", credits=3)
            s2 = Subject(user_id=sample_user_id, semester_id=sample_semester.id, name="데이터베이스", professor="김교수", credits=3)
            db.session.add_all([s1, s2])
            db.session.commit() # 과목 먼저 커밋하여 ID 생성

            # TimeSlot 추가 (기존 유지)
            db.session.add(TimeSlot(subject_id=s1.id, day_of_week=1, start_time="10:00", end_time="11:15", room="창의관 101"))
            db.session.add(TimeSlot(subject_id=s1.id, day_of_week=3, start_time="10:00", end_time="11:15", room="창의관 101"))
            db.session.add(TimeSlot(subject_id=s2.id, day_of_week=2, start_time="13:30", end_time="14:45", room="세종관 205"))
            db.session.add(TimeSlot(subject_id=s2.id, day_of_week=4, start_time="13:30", end_time="14:45", room="세종관 205"))

            # DailyMemo 샘플 추가 (Req 1)
            # 오늘 날짜를 기준으로 샘플 메모 추가 (테스트 용이성)
            today_date = date.today()
            yesterday_date = today_date - timedelta(days=1)
            next_week_date = today_date + timedelta(days=7)

            db.session.add(DailyMemo(
                subject_id=s1.id, memo_date=today_date, note=f"[{today_date.strftime('%Y-%m-%d')}] 오늘 수업 내용: Flask 라우팅 기초"
            ))
            db.session.add(DailyMemo(
                subject_id=s1.id, memo_date=yesterday_date, note=f"[{yesterday_date.strftime('%Y-%m-%d')}] 어제 복습 내용 정리"
            ))
            db.session.add(DailyMemo(
                subject_id=s2.id, memo_date=today_date, note=f"[{today_date.strftime('%Y-%m-%d')}] 데이터베이스 정규화 복습 필요"
            ))
            db.session.add(DailyMemo(
                subject_id=s1.id, memo_date=next_week_date, note=f"[{next_week_date.strftime('%Y-%m-%d')}] 다음 주 발표 준비 시작"
            ))

            db.session.commit()

        # 샘플 Schedule 유지
        Schedule.query.filter_by(user_id=sample_user_id, date=datetime.now().strftime('%Y-%m-%d')).delete()
        db.session.add(Schedule(user_id=sample_user_id, date=datetime.now().strftime('%Y-%m-%d'), time="15:00", title="팀 프로젝트 회의", location="스터디룸 3"))
        db.session.commit()
        print(f"Sample data for user {sample_user_id} created.")
    else:
        print(f"Sample user {sample_user_id} already exists. Skipping sample data creation.")


# --- Authentication Decorators (기존 유지) ---
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

# --- 데이터 로드 및 정제 함수 (기존 유지) ---
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
        data = {'student': {}, 'faculty': {}, 'student_period': {}, 'faculty_period': {}}
    return data

def get_today_meal_key():
    today = datetime.now()
    day_of_week_kr = ['월', '화', '수', '목', '금', '토', '일'][today.weekday()]
    return f"{today.month}.{today.day}({day_of_week_kr})"

def menu_to_string(menu_list):
    if not menu_list: return ""
    cleaned_menu = [item.strip() for item in menu_list if item and not item.lower().endswith('kcal') and not item.isdigit() and 'kcal' not in item.lower()]
    cleaned_menu = [item.split('(')[0].strip() for item in cleaned_menu if item.split('(')[0].strip()]
    unique_menu = sorted(list(set(cleaned_menu)))
    return ", ".join(unique_menu)

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
        if '중식' in daily_menu: formatted_menu['lunch'] = menu_to_string(daily_menu['중식'].get('메뉴', []))
    return formatted_menu

def format_weekly_meal_for_client(weekly_meal_data):
    # 주간 식단표는 원본 데이터를 그대로 전달 (JS가 원본 키를 사용하므로)
    formatted_data = {
        "기간": weekly_meal_data.get('student_period', weekly_meal_data.get('faculty_period', {})),
        "식단": {
            "student": weekly_meal_data.get('student', {}),
            "faculty": weekly_meal_data.get('faculty', {})
        }
    }
    return formatted_data


SHUTTLE_SCHEDULE_DATA = load_bus_schedule()
MEAL_PLAN_DATA = load_meal_data()
TODAY_MEAL_KEY = get_today_meal_key()

# --- 페이지 엔드포인트 (기존 유지) ---
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
    all_user_subjects = Subject.query.filter_by(user_id=user_id).all()

    # --- 수정 (Req 1) ---
    # 총 이수 학점: 성적 여부와 관계없이 모든 과목 학점 합산
    total_earned_credits = sum(subject.credits for subject in all_user_subjects)
    # --- 수정 끝 ---

    GRADE_MAP = {"A+": 4.5, "A0": 4.0, "B+": 3.5, "B0": 3.0, "C+": 2.5, "C0": 2.0, "D+": 1.5, "D0": 1.0, "F": 0.0}
    total_gpa_credits = 0
    total_gpa_score = 0
    for subject in all_user_subjects:
        grade_score = GRADE_MAP.get(subject.grade)
        if grade_score is not None:
            total_gpa_credits += subject.credits
            total_gpa_score += (grade_score * subject.credits)
    overall_gpa = (total_gpa_score / total_gpa_credits) if total_gpa_credits > 0 else 0.0

    current_goal = user.total_credits_goal if user else 130
    remaining_credits = max(0, current_goal - total_earned_credits)

    return render_template(
        'timetable_management.html', user=user, is_admin=user.is_admin if user else False,
        current_credits=total_earned_credits, # 수정된 총 이수 학점 전달
        goal_credits=current_goal,
        remaining_credits=remaining_credits,
        overall_gpa=round(overall_gpa, 2)
    )

# --- Authentication Routes (기존 유지) ---
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
            app.permanent_session_lifetime = timedelta(hours=1)
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
        if db.session.get(User, student_id):
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
    member_list = sorted(
        [{"id": user.id, "name": user.name, "department": user.department, "is_admin": user.is_admin} for user in all_users],
        key=lambda x: (not x['is_admin'], x['id'])
    )
    return render_template('admin.html', member_count=member_count, member_list=member_list)

# --- Public API Endpoints (기존 유지) ---
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
@app.route('/api/schedule', methods=['GET'])
@login_required
def get_schedule():
    user_id = session['student_id']
    today = datetime.now()
    today_str = today.strftime('%Y-%m-%d')
    today_day_of_week = today.weekday() + 1
    schedule_list = []
    user_schedules = Schedule.query.filter_by(user_id=user_id, date=today_str).all()
    for s in user_schedules:
        schedule_list.append({"type": "schedule", "time": s.time, "title": s.title, "location": s.location})

    # 현재 학기 찾는 로직 (기존 유지)
    current_semester = None
    all_semesters = Semester.query.filter_by(user_id=user_id).order_by(Semester.year.desc()).all()
    if all_semesters:
        current_found = False
        today_date_obj = today.date()
        for s in all_semesters:
            start = s.start_date if s.start_date else _get_semester_start_date_fallback(s.year, s.season)
            # 학기 기간 로직 단순화 (시작일 기준)
            if start and start <= today_date_obj and today_date_obj <= start + timedelta(weeks=16):
                 current_semester = s
                 current_found = True
                 break
        if not current_found and all_semesters:
            season_order = {"1학기": 1, "여름학기": 2, "2학기": 3, "겨울학기": 4}
            all_semesters.sort(key=lambda sem: (sem.year, season_order.get(sem.season, 99)), reverse=True)
            current_semester = all_semesters[0]

    if current_semester and 1 <= today_day_of_week <= 5:
        today_subjects = Subject.query.join(TimeSlot).filter(Subject.semester_id == current_semester.id).filter(TimeSlot.day_of_week == today_day_of_week).all()
        for subject in today_subjects:
            subject_timeslots_today = [ts for ts in subject.timeslots if ts.day_of_week == today_day_of_week]
            for ts in subject_timeslots_today:
                schedule_list.append({"type": "class", "time": ts.start_time, "title": subject.name, "location": ts.room})
    schedule_list.sort(key=lambda x: x['time'])
    return jsonify(schedule_list)

@app.route('/api/schedule/add', methods=['POST'])
@login_required
def add_schedule():
    user_id = session['student_id']
    data = request.json
    s_date, s_time, s_title, s_location = data.get('date'), data.get('time'), data.get('title'), data.get('location')
    if not all([s_date, s_time, s_title]): return jsonify({"status": "error", "message": "날짜, 시간, 일정 내용은 필수입니다."}), 400
    try:
        datetime.strptime(s_date, '%Y-%m-%d'); datetime.strptime(s_time, '%H:%M')
    except ValueError: return jsonify({"status": "error", "message": "날짜 또는 시간 형식이 잘못되었습니다."}), 400
    try:
        new_schedule = Schedule(user_id=user_id, date=s_date, time=s_time, title=s_title, location=s_location)
        db.session.add(new_schedule)
        db.session.commit()
        return jsonify({"status": "success", "message": "일정이 추가되었습니다.", "schedule": {"id": new_schedule.entry_id, "type": "schedule", "date": new_schedule.date, "time": new_schedule.time, "title": new_schedule.title, "location": new_schedule.location}}), 201
    except Exception as e:
        db.session.rollback(); return jsonify({"status": "error", "message": f"일정 추가 중 오류 발생: {e}"}), 500

@app.route('/api/semesters', methods=['GET'])
@login_required
def handle_semesters():
    user_id = session['student_id']
    semesters = Semester.query.filter_by(user_id=user_id).all()
    season_order = {"1학기": 1, "여름학기": 2, "2학기": 3, "겨울학기": 4}
    semesters.sort(key=lambda s: (s.year, season_order.get(s.season, 99)), reverse=True)
    return jsonify([{"id": s.id, "name": s.name} for s in semesters])

@app.route('/api/timetable-data', methods=['GET'])
@login_required
def get_timetable_data():
    user_id = session['student_id']
    semester_id_str = request.args.get('semester_id')
    semester = None

    # 학기 결정 로직 (기존과 동일)
    if semester_id_str: # 학기 ID가 명시적으로 주어졌을 때
        try:
            semester = db.session.get(Semester, int(semester_id_str))
            if semester and semester.user_id != user_id: semester = None
        except ValueError: semester = None
    else: # 학기 ID가 주어지지 않았을 때 (기본 학기 로직)
        today = date.today()
        all_semesters = Semester.query.filter_by(user_id=user_id).order_by(Semester.year.desc()).all()
        if all_semesters:
            current_found = False
            for s in all_semesters:
                start = s.start_date if s.start_date else _get_semester_start_date_fallback(s.year, s.season)
                if start and start <= today and today <= start + timedelta(weeks=16): # 대략 16주
                    semester = s
                    current_found = True
                    break
            if not current_found and all_semesters:
                season_order = {"1학기": 1, "여름학기": 2, "2학기": 3, "겨울학기": 4}
                all_semesters.sort(key=lambda s: (s.year, season_order.get(s.season, 99)), reverse=True)
                semester = all_semesters[0]

    if not semester: # 학기 못 찾으면 최신 학기 선택 (기존과 동일)
        all_semesters = Semester.query.filter_by(user_id=user_id).order_by(Semester.year.desc()).all()
        if all_semesters:
             season_order = {"1학기": 1, "여름학기": 2, "2학기": 3, "겨울학기": 4}
             all_semesters.sort(key=lambda s: (s.year, season_order.get(s.season, 99)), reverse=True)
             semester = all_semesters[0]
        else: # 학기 없으면 404
             # --- 수정 ---
             # 'current_semester_credits' 제거
             return jsonify({"semester": None, "subjects": []}), 404
             # --- 수정 끝 ---

    # 선택된 학기의 과목 정보 로드 (기존과 동일)
    subjects = Subject.query.filter_by(user_id=user_id, semester_id=semester.id).all()
    result = []
    # current_semester_credits 계산 제거
    for s in subjects:
        timeslots_data = [{"id": ts.id, "day": ts.day_of_week, "start": ts.start_time, "end": ts.end_time, "room": ts.room} for ts in s.timeslots]
        result.append({"id": s.id, "name": s.name, "professor": s.professor, "credits": s.credits, "grade": s.grade, "timeslots": timeslots_data})
        # 학점 누적 제거

    semester_info = {"id": semester.id, "name": semester.name, "year": semester.year, "season": semester.season, "start_date": semester.start_date.isoformat() if semester.start_date else None}
    # --- 수정 ---
    # 'current_semester_credits' 반환 제거
    return jsonify({"semester": semester_info, "subjects": result})
    # --- 수정 끝 ---


@app.route('/api/subjects', methods=['POST'])
@login_required
def create_subject():
    user_id = session['student_id']; data = request.json; semester_id = data.get('semester_id'); name = data.get('name')
    if not semester_id or not name: return jsonify({"status": "error", "message": "학기 ID와 과목명은 필수입니다."}), 400
    semester = db.session.get(Semester, semester_id)
    if not semester or semester.user_id != user_id: return jsonify({"status": "error", "message": "유효하지 않은 학기입니다."}), 404
    try:
        new_subject = Subject(user_id=user_id, semester_id=semester_id, name=name, professor=data.get('professor'), credits=data.get('credits', 3), grade='Not Set')
        db.session.add(new_subject); db.session.flush() # ID 생성을 위해 flush
        for ts_data in data.get('timeslots', []):
             if ts_data.get('day') and ts_data.get('start') and ts_data.get('end'):
                 db.session.add(TimeSlot(subject_id=new_subject.id, day_of_week=ts_data.get('day'), start_time=ts_data.get('start'), end_time=ts_data.get('end'), room=ts_data.get('room')))
        db.session.commit()

        # --- 수정 (Req 1) ---
        # 사용자의 '전체' 총 이수 학점 재계산
        all_user_subjects = Subject.query.filter_by(user_id=user_id).all()
        total_earned_credits = sum(s.credits for s in all_user_subjects)
        # --- 수정 끝 ---

        created_subject_data = {"id": new_subject.id, "name": new_subject.name, "professor": new_subject.professor, "credits": new_subject.credits, "grade": new_subject.grade, "timeslots": [{"id": ts.id, "day": ts.day_of_week, "start": ts.start_time, "end": ts.end_time, "room": ts.room} for ts in new_subject.timeslots]}
        
        # --- 수정 (Req 1) ---
        # 'current_semester_credits' 대신 'total_earned_credits' 반환
        return jsonify({"status": "success", "message": "과목이 추가되었습니다.", "subject": created_subject_data, "total_earned_credits": total_earned_credits}), 201
        # --- 수정 끝 ---
    except Exception as e:
        db.session.rollback(); return jsonify({"status": "error", "message": f"과목 추가 중 오류 발생: {e}"}), 500

@app.route('/api/subjects/<int:subject_id>', methods=['PUT', 'DELETE'])
@login_required
def handle_subject(subject_id):
    user_id = session['student_id']; subject = db.session.get(Subject, subject_id)
    if not subject or subject.user_id != user_id: return jsonify({"status": "error", "message": "과목을 찾을 수 없거나 권한이 없습니다."}), 404

    if request.method == 'PUT':
        data = request.json
        try:
            subject.name = data.get('name', subject.name)
            subject.professor = data.get('professor', subject.professor)
            subject.credits = data.get('credits', subject.credits)
            subject.grade = data.get('grade', subject.grade)

            TimeSlot.query.filter_by(subject_id=subject.id).delete()
            for ts_data in data.get('timeslots', []):
                 if ts_data.get('day') and ts_data.get('start') and ts_data.get('end'):
                     db.session.add(TimeSlot(subject_id=subject.id, day_of_week=ts_data.get('day'), start_time=ts_data.get('start'), end_time=ts_data.get('end'), room=ts_data.get('room')))
            db.session.commit()

            # --- 수정 (Req 1) ---
            # 사용자의 '전체' 총 이수 학점 재계산
            all_user_subjects = Subject.query.filter_by(user_id=user_id).all()
            total_earned_credits = sum(s.credits for s in all_user_subjects)
            # --- 수정 끝 ---

            updated_subject_data = {"id": subject.id, "name": subject.name, "professor": subject.professor, "credits": subject.credits, "grade": subject.grade, "timeslots": [{"id": ts.id, "day": ts.day_of_week, "start": ts.start_time, "end": ts.end_time, "room": ts.room} for ts in subject.timeslots]}
            
            # --- 수정 (Req 1) ---
            # 'current_semester_credits' 대신 'total_earned_credits' 반환
            return jsonify({"status": "success", "message": "과목이 수정되었습니다.", "subject": updated_subject_data, "total_earned_credits": total_earned_credits})
            # --- 수정 끝 ---
        except Exception as e:
            db.session.rollback(); return jsonify({"status": "error", "message": f"과목 수정 중 오류 발생: {e}"}), 500

    if request.method == 'DELETE':
        try:
            DailyMemo.query.filter_by(subject_id=subject.id).delete()
            TimeSlot.query.filter_by(subject_id=subject.id).delete()
            db.session.delete(subject); db.session.commit()

            # --- 수정 (Req 1) ---
            # 사용자의 '전체' 총 이수 학점 재계산
            all_user_subjects = Subject.query.filter_by(user_id=user_id).all()
            total_earned_credits = sum(s.credits for s in all_user_subjects)
            # --- 수정 끝 ---
            
            # --- 수정 (Req 1) ---
            # 'current_semester_credits' 대신 'total_earned_credits' 반환
            return jsonify({"status": "success", "message": "과목 및 관련 데이터가 삭제되었습니다.", "total_earned_credits": total_earned_credits})
            # --- 수정 끝 ---
        except Exception as e:
            db.session.rollback(); return jsonify({"status": "error", "message": f"과목 삭제 중 오류 발생: {e}"}), 500


# --- DailyMemo API (기존 유지) ---
@app.route('/api/subjects/<int:subject_id>/memo/<memo_date_str>', methods=['GET'])
@login_required
def get_daily_memo(subject_id, memo_date_str):
    user_id = session['student_id']
    subject = db.session.get(Subject, subject_id)
    if not subject or subject.user_id != user_id:
        return jsonify({"status": "error", "message": "과목을 찾을 수 없거나 권한이 없습니다."}), 404

    try:
        memo_date = datetime.strptime(memo_date_str, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({"status": "error", "message": "날짜 형식이 잘못되었습니다 (YYYY-MM-DD)."}), 400

    daily_memo = DailyMemo.query.filter_by(subject_id=subject.id, memo_date=memo_date).first()
    note = daily_memo.note if daily_memo else ""
    return jsonify({"status": "success", "date": memo_date_str, "note": note})

@app.route('/api/subjects/<int:subject_id>/memo/<memo_date_str>', methods=['PUT'])
@login_required
def update_daily_memo(subject_id, memo_date_str):
    user_id = session['student_id']
    subject = db.session.get(Subject, subject_id)
    if not subject or subject.user_id != user_id:
        return jsonify({"status": "error", "message": "과목을 찾을 수 없거나 권한이 없습니다."}), 404

    try:
        memo_date = datetime.strptime(memo_date_str, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({"status": "error", "message": "날짜 형식이 잘못되었습니다 (YYYY-MM-DD)."}), 400

    data = request.json
    note = data.get('note', '').strip()

    try:
        daily_memo = DailyMemo.query.filter_by(subject_id=subject.id, memo_date=memo_date).first()

        if not daily_memo:
            if note:
                daily_memo = DailyMemo(subject_id=subject.id, memo_date=memo_date, note=note)
                db.session.add(daily_memo)
            else:
                return jsonify({"status": "success", "message": "저장할 내용이 없습니다."})
        else:
            daily_memo.note = note

        db.session.commit()
        return jsonify({"status": "success", "message": f"{memo_date_str} 메모가 저장되었습니다.", "data": {"date": memo_date_str, "note": daily_memo.note}})
    except Exception as e:
        db.session.rollback()
        return jsonify({"status": "error", "message": f"메모 저장 중 오류 발생: {e}"}), 500


# --- 주차별 메모 모아보기 API (기존 유지) ---
@app.route('/api/subjects/<int:subject_id>/all-memos-by-week', methods=['GET'])
@login_required
def get_all_memos_by_week(subject_id):
    user_id = session['student_id']
    subject = db.session.get(Subject, subject_id)
    if not subject or subject.user_id != user_id:
        return jsonify({"status": "error", "message": "과목을 찾을 수 없거나 권한이 없습니다."}), 404

    try:
        semester = subject.semester
        semester_start_date = semester.start_date if semester.start_date else get_semester_start_date_from_calendar(semester.year, semester.season)
        if not semester_start_date:
            return jsonify({"status": "error", "message": "학기 시작일을 계산할 수 없습니다."}), 500

        all_memos = DailyMemo.query.filter_by(subject_id=subject.id).order_by(DailyMemo.memo_date).all()

        memos_by_week = {}
        for memo in all_memos:
            if memo.memo_date >= semester_start_date:
                days_diff = (memo.memo_date - semester_start_date).days
                week_num = (days_diff // 7) + 1
            else:
                week_num = 0

            if week_num not in memos_by_week:
                memos_by_week[week_num] = []

            memos_by_week[week_num].append({
                "date": memo.memo_date.isoformat(),
                "note": memo.note
            })

        result_data = []
        for week_num in range(1, 17):
            date_range = f"{week_num}주차"
            try:
                week_start = semester_start_date + timedelta(weeks=(week_num - 1))
                week_end = week_start + timedelta(days=6)
                date_range = f"{week_start.strftime('%m.%d')} ~ {week_end.strftime('%m.%d')}"
            except OverflowError: pass

            result_data.append({
                "week_number": week_num,
                "date_range": date_range,
                "memos": memos_by_week.get(week_num, [])
            })

        return jsonify({"status": "success", "subject_name": subject.name, "data": result_data})

    except Exception as e:
        print(f"Error in get_all_memos_by_week: {e}")
        return jsonify({"status": "error", "message": f"전체 메모 로드 중 오류: {e}"}), 500


# --- GPA, 공부 시간 관련 API (수정) ---
@app.route('/api/gpa-stats', methods=['GET'])
@login_required
def get_gpa_stats():
    user_id = session['student_id']; semesters = Semester.query.filter_by(user_id=user_id).all()
    season_order = {"1학기": 1, "여름학기": 2, "2학기": 3, "겨울학기": 4}; semesters.sort(key=lambda s: (s.year, season_order.get(s.season, 99)))
    stats = []; GRADE_MAP = {"A+": 4.5, "A0": 4.0, "B+": 3.5, "B0": 3.0, "C+": 2.5, "C0": 2.0, "D+": 1.5, "D0": 1.0, "F": 0.0}
    for semester in semesters:
        subjects = semester.subjects; semester_gpa_credits, semester_gpa_score = 0, 0
        for subject in subjects:
            grade_score = GRADE_MAP.get(subject.grade)
            if grade_score is not None: semester_gpa_credits += subject.credits; semester_gpa_score += (grade_score * subject.credits)
        if semester_gpa_credits > 0: semester_gpa = (semester_gpa_score / semester_gpa_credits); stats.append({"semester_name": semester.name, "gpa": round(semester_gpa, 2)})
    
    all_subjects = Subject.query.filter_by(user_id=user_id).all()
    
    # --- 수정 (Req 1) ---
    # 총 이수 학점: 성적 여부와 관계없이 모든 과목 학점 합산
    total_earned_credits = sum(s.credits for s in all_subjects)
    # --- 수정 끝 ---
    
    total_gpa_credits, total_gpa_score = 0, 0
    for subject in all_subjects:
        grade_score = GRADE_MAP.get(subject.grade)
        if grade_score is not None: total_gpa_credits += subject.credits; total_gpa_score += (grade_score * subject.credits)
    overall_gpa = (total_gpa_score / total_gpa_credits) if total_gpa_credits > 0 else 0.0
    
    return jsonify({"semesters": stats, "overall_gpa": round(overall_gpa, 2), "total_earned_credits": total_earned_credits})

@app.route('/api/study-stats', methods=['GET'])
@login_required
def get_study_stats():
    user_id = session['student_id']; today = datetime.now().date(); today_str = today.strftime('%Y-%m-%d')
    today_log = StudyLog.query.filter_by(user_id=user_id, date=today_str).first(); today_seconds = today_log.duration_seconds if today_log else 0
    seven_days_ago = today - timedelta(days=6); seven_days_ago_str = seven_days_ago.strftime('%Y-%m-%d')
    weekly_logs = StudyLog.query.filter(StudyLog.user_id == user_id, StudyLog.date >= seven_days_ago_str, StudyLog.date <= today_str).all()
    total_seconds = sum(log.duration_seconds for log in weekly_logs); weekly_avg_seconds = total_seconds / 7
    return jsonify({"today": today_seconds, "weekly_avg": weekly_avg_seconds})

@app.route('/api/study-time', methods=['POST'])
@login_required
def save_study_time():
    data = request.json; duration_to_add = data.get('duration_to_add'); date_str = data.get('date'); user_id = session['student_id']
    if not isinstance(duration_to_add, int) or duration_to_add < 0 or not date_str: return jsonify({"status": "error", "message": "잘못된 요청입니다."}), 400
    try:
        datetime.strptime(date_str, '%Y-%m-%d')
        log_entry = StudyLog.query.filter_by(user_id=user_id, date=date_str).first()
        if log_entry: log_entry.duration_seconds += duration_to_add
        else: log_entry = StudyLog(user_id=user_id, date=date_str, duration_seconds=duration_to_add); db.session.add(log_entry)
        db.session.commit()
        return jsonify({"status": "success", "data": {"total_duration": log_entry.duration_seconds}})
    except ValueError: return jsonify({"status": "error", "message": "잘못된 날짜 형식입니다."}), 400
    except Exception as e:
        db.session.rollback(); return jsonify({"status": "error", "message": f"공부 시간 저장 중 오류 발생: {e}"}), 500


# --- 독립 Todo API (기존 유지) ---
@app.route('/api/todos', methods=['GET'])
@login_required
def get_todos():
    """ 이번 주 Todo 가져오기 (JS에서 계산된 주 시작/종료일 기준) """
    user_id = session['student_id']
    semester_id = request.args.get('semester_id', type=int)
    start_date_str = request.args.get('start_date') # YYYY-MM-DD
    end_date_str = request.args.get('end_date')     # YYYY-MM-DD

    if not semester_id or not start_date_str or not end_date_str:
        return jsonify({'status': 'error', 'message': '학기 ID와 날짜 범위가 필요합니다.'}), 400

    try:
        start_date_obj = datetime.strptime(start_date_str, '%Y-%m-%d').date()
        end_date_obj = datetime.strptime(end_date_str, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({'status': 'error', 'message': '날짜 형식이 올바르지 않습니다.'}), 400

    todos = Todo.query.filter(
        Todo.user_id == user_id,
        Todo.semester_id == semester_id,
        Todo.due_date >= start_date_obj,
        Todo.due_date <= end_date_obj
    ).order_by(Todo.due_date, Todo.created_at).all()

    return jsonify({
        'status': 'success',
        'todos': [todo.to_dict() for todo in todos]
    })


@app.route('/api/todos', methods=['POST'])
@login_required
def create_todo():
    """ 새로운 Todo 생성 """
    user_id = session['student_id']
    data = request.get_json()
    if not data or 'task' not in data or 'due_date' not in data or 'semester_id' not in data:
        return jsonify({'status': 'error', 'message': '필수 데이터 누락'}), 400

    try:
        due_date_obj = datetime.strptime(data['due_date'], '%Y-%m-%d').date()
        semester_id = int(data['semester_id'])
        task = data['task'].strip()

        if not task:
             return jsonify({'status': 'error', 'message': 'Todo 내용이 없습니다.'}), 400

        # 해당 학기가 유효한지 확인
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
    """ Todo 수정(완료/미완료) 또는 삭제 """
    user_id = session['student_id']
    todo = db.session.get(Todo, todo_id)

    # Todo가 존재하지 않거나, 현재 사용자의 Todo가 아닌 경우
    if not todo or todo.user_id != user_id:
        return jsonify({'status': 'error', 'message': 'Todo를 찾을 수 없습니다.'}), 404

    try:
        if request.method == 'PUT':
            # 완료/미완료 토글
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

# --- 목표 학점 업데이트 API (기존 유지) ---
@app.route('/api/credits/goal', methods=['POST'])
@login_required
def update_credit_goal():
    data = request.json; new_goal = data.get('goal', type=int); user_id = session['student_id']
    if new_goal is None or new_goal <= 0: return jsonify({"status": "error", "message": "유효하지 않은 학점입니다."}), 400
    try:
        user = db.session.get(User, user_id)
        if not user: return jsonify({"status": "error", "message": "사용자를 찾을 수 없습니다."}), 404
        user.total_credits_goal = new_goal; db.session.commit()
        return jsonify({"status": "success", "message": "목표 학점이 업데이트되었습니다.", "new_goal": new_goal})
    except Exception as e:
        db.session.rollback(); return jsonify({"status": "error", "message": f"업데이트 중 오류 발생: {e}"}), 500

# --- 앱 실행 부분 (기존 유지) ---
if __name__ == '__main__':
    with app.app_context():
        try:
            print("--- [KUSIS] Checking database and initial data... ---")
            create_initial_data()
            print("--- [KUSIS] Database check complete. System ready. ---")
        except Exception as e:
            print(f"--- [KUSIS] CRITICAL: Error during DB check/initialization: {e} ---")
            print("--- [KUSIS] Please check your .env file and ensure the database server is running. ---")

    scheduler = BackgroundScheduler()
    scheduler.add_job(manage_semesters_job, 'cron', month=12, day=1, hour=3, id='semester_management_job')
    scheduler.start()
    print("Scheduler started... Press Ctrl+C to exit")
    atexit.register(lambda: scheduler.shutdown())

    app.run(debug=True, port=2424)