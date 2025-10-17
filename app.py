from flask import Flask, render_template, jsonify, request, redirect, url_for, session, flash
from datetime import datetime, timedelta, date
import json
import csv
import os
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash
from flask_sqlalchemy import SQLAlchemy
import urllib.parse
from dotenv import load_dotenv # <--- (신규) .env 파일을 읽기 위해 추가

# (신규) .env 파일의 환경 변수를 로드
load_dotenv()

app = Flask(__name__)

# --- Configuration for Session & Security ---
app.secret_key = 'your_super_secret_key_for_session_management' 
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=1) 
app.config['SESSION_TYPE'] = 'filesystem' 

# --- (수정) Database Configuration ---
# 1. .env 파일에서 DB 정보를 안전하게 불러오기
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_NAME = os.getenv("DB_NAME")

# 2. 비밀번호에 특수문자(예: !, @)가 있어도 괜찮도록 인코딩
ENCODED_PASSWORD = urllib.parse.quote_plus(DB_PASSWORD)

# 3. 완성된 URI를 app.config에 설정
app.config['SQLALCHEMY_DATABASE_URI'] = f'postgresql://{DB_USER}:{ENCODED_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
# --- DB 설정 종료 ---

db = SQLAlchemy(app)

# 파일 경로 설정 (app.py 기준)
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
    id = db.Column(db.String(10), primary_key=True) # 학번
    name = db.Column(db.String(50), nullable=False)
    dob = db.Column(db.String(10), nullable=False) # 'YYYY-MM-DD'
    college = db.Column(db.String(100), nullable=False)
    department = db.Column(db.String(100), nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    is_admin = db.Column(db.Boolean, default=False, nullable=False)
    
    # (신규) Request 3: 학점 계산
    total_credits_goal = db.Column(db.Integer, default=130, nullable=False) 
    
    timetables = db.relationship('Timetable', backref='user', lazy=True, cascade="all, delete-orphan")
    schedules = db.relationship('Schedule', backref='user', lazy=True, cascade="all, delete-orphan")
    study_logs = db.relationship('StudyLog', backref='user', lazy=True, cascade="all, delete-orphan")
    quick_links = db.relationship('QuickLink', backref='user', lazy=True, cascade="all, delete-orphan")

class Timetable(db.Model):
    __tablename__ = 'timetables'
    entry_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(10), db.ForeignKey('users.id'), nullable=False)
    day = db.Column(db.Integer, nullable=False) 
    period = db.Column(db.Integer, nullable=False) 
    subject = db.Column(db.String(100))
    professor = db.Column(db.String(50))
    room = db.Column(db.String(50))
    
    # (신규) Request 2: 학점
    credits = db.Column(db.Integer, default=0) 
    
    # (수정) Request 4: 메모/Todo (JSON 저장을 위해 Text 타입 유지)
    memo = db.Column(db.Text, default='') 
    
    # (신규) 시간표 중복 등록 방지를 위한 제약 조건
    __table_args__ = (db.UniqueConstraint('user_id', 'day', 'period', name='_user_day_period_uc'),)


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
    icon_url = db.Column(db.String(500)) # (수정) Request 1: 아이콘 클래스 (예: 'fas fa-globe') 저장

# --- DB 초기화 및 샘플 데이터 생성 ---
def create_initial_data():
    with app.app_context():
        db.create_all()
        
        admin_user = User.query.get("9999123456")
        if not admin_user:
            admin_user = User(
                id="9999123456", name="admin", dob="2004-06-16", college="관리자", 
                department="관리팀", password_hash=generate_password_hash("1234"), is_admin=True,
                total_credits_goal=130 # (신규)
            )
            db.session.add(admin_user)
        
        sample_user = User.query.get("2023390822")
        if not sample_user:
            sample_user = User(
                name="장선규", id="2023390822", dob="2004-03-24", college="과학기술대학", 
                department="컴퓨터융합소프트웨어학과", password_hash=generate_password_hash("password123"), is_admin=False,
                total_credits_goal=130 # (신규)
            )
            db.session.add(sample_user)
            
            # (수정) Request 2, 4: 학점, JSON형식 메모 추가
            default_memo = json.dumps({"note": "", "todos": []})
            web_memo = json.dumps({
                "note": "과제 제출 기한 엄수!",
                "todos": [
                    {"task": "HTML/CSS 복습", "done": True},
                    {"task": "Flask 라우팅 공부", "done": False}
                ]
            })
            
            sample_timetable = [
                {"day": 1, "period": 1, "subject": "데이터베이스", "professor": "김교수", "room": "세종관 301", "credits": 3, "memo": default_memo},
                {"day": 1, "period": 3, "subject": "웹프로그래밍", "professor": "이교수", "room": "창의관 205", "credits": 3, "memo": web_memo},
                {"day": 2, "period": 2, "subject": "알고리즘", "professor": "박교수", "room": "세종관 405", "credits": 3, "memo": default_memo},
                {"day": 3, "period": 1, "subject": "데이터베이스", "professor": "김교수", "room": "세종관 301", "credits": 0, "memo": default_memo}, # DB는 주 2회, 학점은 1번에만
                {"day": 4, "period": 4, "subject": "컴퓨터구조", "professor": "최교수", "room": "창의관 301", "credits": 3, "memo": default_memo},
                {"day": 5, "period": 1, "subject": "운영체제", "professor": "정교수", "room": "세종관 501", "credits": 3, "memo": default_memo},
            ]
            
            Timetable.query.filter_by(user_id="2023390822").delete()
            for item in sample_timetable:
                db.session.add(Timetable(user_id="2023390822", **item))

            today_str = datetime(2025, 10, 16).strftime('%Y-%m-%d')
            sample_schedule = [
                {"date": today_str, "time": "09:00", "title": "데이터베이스 설계", "location": "세종관 301호"},
                {"date": today_str, "time": "13:00", "title": "웹 프로그래밍", "location": "창의관 205호"},
                {"date": today_str, "time": "15:00", "title": "스터디 모임", "location": "도서관 4층"},
            ]
            Schedule.query.filter_by(user_id="2023390822", date=today_str).delete()
            for item in sample_schedule:
                db.session.add(Schedule(user_id="2023390822", **item))
                
            # (신규) Request 1: 샘플 퀵 링크
            QuickLink.query.filter_by(user_id="2023390822").delete()
            sample_links = [
                {"user_id": "2023390822", "title": "네이버", "url": "https://www.naver.com", "icon_url": "fa-solid fa-n"},
                {"user_id": "2023390822", "title": "구글", "url": "https://www.google.com", "icon_url": "fa-brands fa-google"},
                {"user_id": "2023390822", "title": "LMS", "url": "https://lms.korea.ac.kr", "icon_url": "fa-solid fa-book"},
            ]
            for link in sample_links:
                db.session.add(QuickLink(**link))

        db.session.commit()

# --- Authentication/Authorization Decorators ---

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'student_id' not in session:
            flash("로그인이 필요합니다.", "warning")
            return redirect(url_for('login', next=request.url))
        
        user = User.query.get(session['student_id'])
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
        
        user = User.query.get(session['student_id'])
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
            next(f) 
            reader = csv.DictReader(f, fieldnames=['Departure_Time', 'Route', 'Type', 'Note'])
            for row in reader:
                note = row['Note'].strip()
                
                if row['Route'] == 'Station_to_School': route_kr = '조치원역 → 학교'
                elif row['Route'] == 'School_to_Station': route_kr = '학교 → 조치원역'
                elif row['Route'] == 'Station_to_Osong': route_kr = '조치원역 → 오송역'
                elif row['Route'] == 'School_to_Osong': route_kr = '학교 → 조치원역/오송역'
                else: route_kr = row['Route']
                    
                if '오송역' in note:
                    if row['Route'] == 'Station_to_School': route_kr = '조치원/오송역 → 학교 (경유)'
                    elif row['Route'] == 'School_to_Station': route_kr = '학교 → 조치원역/오송역 (경유)'
                         
                route_group = "Jochiwon"
                if '오송역' in note or row['Route'].endswith('Osong'):
                    route_group = "Osong_Included"

                type_kr = '평일' if row['Type'] == 'Weekday' else '일요일' if row['Type'] == 'Sunday' else '기타'
                
                schedule.append({
                    "time": row['Departure_Time'], "route": route_kr,
                    "type": type_kr, "note": note, "route_group": route_group
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
    # (파일 기준 2025/10/16 목요일)
    today = datetime(2025, 10, 16) 
    day_of_week_kr = ['월', '화', '수', '목', '금', '토', '일'][today.weekday()]
    return f"{today.month}.{today.day}({day_of_week_kr})"

def menu_to_string(menu_list):
    cleaned_menu = [
        item.strip() for item in menu_list 
        if not item.lower().endswith('kcal') and not item.isdigit() and 'kcal' not in item.lower()
    ]
    cleaned_menu = [item.split('(')[0].strip() for item in cleaned_menu]
    return ", ".join(sorted(list(set(item for item in cleaned_menu if item))))
    
def format_meal_for_client(menu_data, target_date_key, cafeteria_type):
    formatted_menu = {"breakfast": "식단 정보 없음", "lunch": "식단 정보 없음", "dinner": "식단 정보 없음"}

    if cafeteria_type == 'student':
        formatted_menu['lunch'] = {
            'korean': "식단 정보 없음", 'ala_carte': "식단 정보 없음", 'snack_plus': "식단 정보 없음",
        }
        
    daily_menu = menu_data.get(target_date_key, {})
    
    if cafeteria_type == 'student':
        if '조식' in daily_menu:
            formatted_menu['breakfast'] = menu_to_string(daily_menu['조식']['메뉴'])
        if '중식-한식' in daily_menu: 
            formatted_menu['lunch']['korean'] = menu_to_string(daily_menu['중식-한식']['메뉴'])
        ala_carte_items = []
        if '중식-일품' in daily_menu: 
            ala_carte_items.append("일품: " + menu_to_string(daily_menu['중식-일품']['메뉴']))
        if '중식-분식' in daily_menu: 
            ala_carte_items.append("분식: " + menu_to_string(daily_menu['중식-분식']['메뉴']))
        if ala_carte_items:
            formatted_menu['lunch']['ala_carte'] = " / ".join(ala_carte_items)
        if '중식-plus' in daily_menu: 
            formatted_menu['lunch']['snack_plus'] = menu_to_string(daily_menu['중식-plus']['메뉴'])
        if '석식' in daily_menu:
            formatted_menu['dinner'] = menu_to_string(daily_menu['석식']['메뉴'])

    elif cafeteria_type == 'faculty':
        formatted_menu['breakfast'] = "조식 제공 없음"
        formatted_menu['dinner'] = "석식 제공 없음"
        if '중식' in daily_menu:
            formatted_menu['lunch'] = menu_to_string(daily_menu['중식']['메뉴'])
            
    return formatted_menu

def format_weekly_meal_for_client(weekly_meal_data):
    formatted_data = {
        "기간": weekly_meal_data.get('student_period', weekly_meal_data.get('faculty_period', {})),
        "식단": {}
    }
    all_date_keys = sorted(set(weekly_meal_data['student'].keys()).union(set(weekly_meal_data['faculty'].keys())))
    
    for cafeteria_type in ['student', 'faculty']:
        formatted_data['식단'][cafeteria_type] = {}
        menu_data = weekly_meal_data.get(cafeteria_type, {})
        for date_key in all_date_keys:
            formatted_data['식단'][cafeteria_type][date_key] = format_meal_for_client(
                menu_data, date_key, cafeteria_type
            )
    return formatted_data


# 전역 변수로 데이터 로드
SHUTTLE_SCHEDULE_DATA = load_bus_schedule()
MEAL_PLAN_DATA = load_meal_data()
TODAY_MEAL_KEY = get_today_meal_key()


# --- API 및 페이지 엔드포인트 ---

@app.route('/')
def index():
    user_info = None
    is_admin = False
    if 'student_id' in session:
        user_info = User.query.get(session['student_id'])
        if user_info:
            is_admin = user_info.is_admin
        else:
            session.clear()
    return render_template('index.html', user=user_info, is_admin=is_admin)


# --- (신규) Request 2: 시간표 관리 페이지 ---
@app.route('/timetable-management')
@login_required
def timetable_management():
    user_id = session['student_id']
    user = User.query.get(user_id)
    
    # Request 3: 학점 계산
    user_timetables = Timetable.query.filter_by(user_id=user_id).all()
    
    # 중복 학점 계산 방지 (예: 주 2회 수업)
    # 과목명-교수-분반이 같으면 하나의 과목으로 취급 (여기서는 subject, professor로 단순화)
    unique_subjects = {}
    for entry in user_timetables:
        if entry.subject and entry.credits is not None and entry.credits > 0:
            key = (entry.subject, entry.professor)
            if key not in unique_subjects:
                unique_subjects[key] = entry.credits
                
    current_credits = sum(unique_subjects.values())
    goal_credits = user.total_credits_goal
    
    # Request 4: 메모/Todo 리스트 전달 (JS에서 API로 가져가도록 변경)
    # subjects_with_memos = Timetable.query.filter(Timetable.user_id == user_id, Timetable.subject != None).all()
    
    return render_template(
        'timetable_management.html', 
        user=user, 
        is_admin=user.is_admin,
        current_credits=current_credits,
        goal_credits=goal_credits
    )

# --- Authentication Routes ---

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        student_id = request.form.get('student_id')
        password = request.form.get('password')
        user = User.query.get(student_id)
        
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
        
        # (신규) Request 3: 목표 학점
        total_credits_goal = request.form.get('total_credits_goal', 130, type=int)
        
        if not (name and student_id and password and password_confirm and dob and college and department):
            flash("모든 필드를 입력해주세요.", "danger")
            return render_template('register.html', colleges=COLLEGES)
        if password != password_confirm:
            flash("비밀번호 확인이 일치하지 않습니다.", "danger")
            return render_template('register.html', colleges=COLLEGES)
        if len(student_id) != 10 or not student_id.isdigit():
             flash("학번은 10자리 숫자여야 합니다.", "danger")
             return render_template('register.html', colleges=COLLEGES)
        if college not in COLLEGES or department not in COLLEGES.get(college, []):
            flash("유효하지 않은 단과대학/학과 선택입니다.", "danger")
            return render_template('register.html', colleges=COLLEGES)
        if User.query.get(student_id):
            flash("이미 등록된 학번입니다.", "danger")
            return render_template('register.html', colleges=COLLEGES)
            
        try:
            hashed_password = generate_password_hash(password)
            new_user = User(
                id=student_id, name=name, dob=dob, college=college,
                department=department, password_hash=hashed_password, is_admin=False,
                total_credits_goal=total_credits_goal # (신규)
            )
            db.session.add(new_user)
            db.session.commit()
            flash("회원가입이 성공적으로 완료되었습니다. 로그인해주세요.", "success")
            return redirect(url_for('login'))
        except Exception as e:
            db.session.rollback()
            print(f"Error during registration: {e}")
            flash("회원가입 중 오류가 발생했습니다. 다시 시도해주세요.", "danger")
            
    return render_template('register.html', colleges=COLLEGES)

# --- Admin Route ---

@app.route('/admin')
@admin_required 
def admin_dashboard():
    all_users = User.query.all()
    member_count = len(all_users)
    member_list = sorted(
        [{"id": user.id, "name": user.name, "department": user.department, "is_admin": user.is_admin} 
         for user in all_users], 
        key=lambda x: x['id']
    )
    return render_template('admin.html', member_count=member_count, member_list=member_list)


# --- Public API Endpoints (No Login Required) ---

@app.route('/api/shuttle')
def get_shuttle():
    return jsonify(SHUTTLE_SCHEDULE_DATA)

@app.route('/api/meal')
def get_meal():
    cafeteria = request.args.get('cafeteria', 'student')
    if cafeteria in MEAL_PLAN_DATA:
        formatted_meal = format_meal_for_client(MEAL_PLAN_DATA[cafeteria], TODAY_MEAL_KEY, cafeteria)
        return jsonify(formatted_meal)
    
    # Error fallback
    if cafeteria == 'student':
         return jsonify({
            "breakfast": "식단 정보 없음",
            "lunch": {'korean': "식단 정보 없음", 'ala_carte': "식단 정보 없음", 'snack_plus': "식단 정보 없음"},
            "dinner": "식단 정보 없음"
        })
    else:
        return jsonify({"breakfast": "식단 정보 없음", "lunch": "식단 정보 없음", "dinner": "식단 정보 없음"})

@app.route('/api/meal/week')
def get_weekly_meal():
    formatted_data = format_weekly_meal_for_client(MEAL_PLAN_DATA)
    return jsonify(formatted_data)


# --- Secure API Endpoints (Login Required) ---

@app.route('/api/schedule')
@login_required 
def get_schedule():
    # (파일 기준 2025/10/16)
    today_str = datetime(2025, 10, 16).strftime('%Y-%m-%d')
    user_schedules = Schedule.query.filter_by(
        user_id=session['student_id'], date=today_str
    ).order_by(Schedule.time).all()
    
    schedule_list = [{"time": s.time, "title": s.title, "location": s.location} for s in user_schedules]
    return jsonify(schedule_list)

# (수정) Request 2, 4: 시간표 관리 API 분리
@app.route('/api/timetable', methods=['GET'])
@login_required 
def get_timetable():
    user_timetable = Timetable.query.filter_by(user_id=session['student_id']).all()
    
    # (수정) Request 4: memo 필드가 JSON 문자열일 수 있으므로 파싱 시도
    timetable_list = []
    for t in user_timetable:
        memo_data = t.memo
        if t.memo and t.memo.strip().startswith('{'):
            try:
                memo_data = json.loads(t.memo)
            except json.JSONDecodeError:
                # 파싱 실패 시 원본 텍스트(오래된 메모)를 노트로 변환
                memo_data = {"note": t.memo, "todos": []}
        elif not t.memo:
             memo_data = {"note": "", "todos": []}
        else:
            # JSON이 아닌 단순 텍스트 메모
            memo_data = {"note": t.memo, "todos": []}

        timetable_list.append({
            "day": t.day, "period": t.period, "subject": t.subject, 
            "professor": t.professor, "room": t.room, 
            "credits": t.credits, # (신규) Request 2
            "memo": memo_data # (수정) Request 4
        })
    return jsonify(timetable_list)

# (신규) Request 2: 시간표 "과목"을 추가/수정/삭제하는 API
@app.route('/api/timetable/subject', methods=['POST', 'DELETE'])
@login_required
def handle_timetable_subject():
    user_id = session['student_id']
    data = request.json
    day, period = data.get('day'), data.get('period')

    if not day or not period:
        return jsonify({"status": "error", "message": "날짜와 교시 정보가 필요합니다."}), 400

    entry = Timetable.query.filter_by(user_id=user_id, day=day, period=period).first()

    if request.method == 'POST':
        # 과목 추가 또는 수정
        subject = data.get('subject')
        professor = data.get('professor')
        room = data.get('room')
        credits = data.get('credits', 0, type=int)
        
        try:
            if not entry:
                # 새 항목 생성
                entry = Timetable(
                    user_id=user_id, day=day, period=period,
                    subject=subject, professor=professor, room=room, credits=credits,
                    memo=json.dumps({"note": "", "todos": []}) # (신규) 기본 메모 구조
                )
                db.session.add(entry)
            else:
                # 기존 항목 업데이트
                entry.subject = subject
                entry.professor = professor
                entry.room = room
                entry.credits = credits
                # 메모는 이 API에서 건드리지 않음
            
            db.session.commit()
            return jsonify({"status": "success", "message": "시간표가 저장되었습니다."})
        except Exception as e:
            db.session.rollback()
            print(f"Error saving timetable subject: {e}")
            return jsonify({"status": "error", "message": "시간표 저장 중 오류 발생"}), 500

    elif request.method == 'DELETE':
        # 과목 삭제 (메모까지 초기화)
        if not entry:
             return jsonify({"status": "error", "message": "삭제할 항목을 찾을 수 없습니다."}), 404
        try:
            # (수정) DB에서 아예 삭제하는 대신, 내용을 비움 (메모/Todo 관리를 위해)
            entry.subject = None
            entry.professor = None
            entry.room = None
            entry.credits = 0
            # entry.memo = json.dumps({"note": "", "todos": []}) # 메모는 남겨둘 수 있음
            db.session.commit()
            
            # (대안) DB에서 아예 삭제
            # db.session.delete(entry)
            # db.session.commit()
            
            return jsonify({"status": "success", "message": "시간표 항목이 삭제되었습니다."})
        except Exception as e:
            db.session.rollback()
            print(f"Error deleting timetable subject: {e}")
            return jsonify({"status": "error", "message": "삭제 중 오류 발생"}), 500

# (수정) Request 4: 시간표 "메모/Todo"를 저장하는 API
@app.route('/api/timetable/memo', methods=['POST'])
@login_required 
def save_timetable_memo():
    data = request.json
    day, period = data.get('day'), data.get('period')
    memo_data = data.get('memo') # (수정) 이제 memo_data는 {"note": "...", "todos": [...]} 객체
    user_id = session['student_id']
    
    try:
        # (수정) memo_data를 JSON 문자열로 변환하여 저장
        memo_str = json.dumps(memo_data) 
        
        timetable_entry = Timetable.query.filter_by(user_id=user_id, day=day, period=period).first()
        
        if timetable_entry:
            timetable_entry.memo = memo_str
        else:
            # (신규) 과목 정보가 없는 빈 칸에 메모를 작성할 경우
            timetable_entry = Timetable(
                user_id=user_id, day=day, period=period,
                memo=memo_str
            )
            db.session.add(timetable_entry)
            
        db.session.commit()
        return jsonify({"status": "success", "message": "메모가 저장되었습니다."})
    except Exception as e:
        db.session.rollback()
        print(f"Error saving memo: {e}")
        return jsonify({"status": "error", "message": "메모 저장 중 오류 발생"}), 500


@app.route('/api/study-stats', methods=['GET'])
@login_required
def get_study_stats():
    # (파일 기준 2025/10/16)
    user_id = session['student_id']
    today_str = datetime(2025, 10, 16).strftime('%Y-%m-%d')
    
    today_log = StudyLog.query.filter_by(user_id=user_id, date=today_str).first()
    today_seconds = today_log.duration_seconds if today_log else 0
    
    seven_days_ago = (datetime(2025, 10, 16) - timedelta(days=6)).strftime('%Y-%m-%d')
    weekly_logs = StudyLog.query.filter(
        StudyLog.user_id == user_id,
        StudyLog.date >= seven_days_ago,
        StudyLog.date <= today_str
    ).all()
    
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
        print(f"Error saving study time: {e}")
        return jsonify({"status": "error", "message": "공부 시간 저장 중 오류 발생"}), 500


# (신규) Request 1: 자주 찾는 사이트 (Quick Links) API
@app.route('/api/quick-links', methods=['GET', 'POST'])
@login_required
def handle_quick_links():
    user_id = session['student_id']
    
    if request.method == 'GET':
        links = QuickLink.query.filter_by(user_id=user_id).order_by(QuickLink.entry_id).all()
        links_list = [
            {"id": link.entry_id, "title": link.title, "url": link.url, "icon_url": link.icon_url}
            for link in links
        ]
        return jsonify(links_list)
        
    if request.method == 'POST':
        data = request.json
        title = data.get('title')
        url = data.get('url')
        icon_url = data.get('icon_url') # 예: "fas fa-globe"

        if not title or not url:
            return jsonify({"status": "error", "message": "제목과 URL은 필수입니다."}), 400
        
        # (신규) URL 유효성 검사 (http:// 또는 https://로 시작하도록)
        if not url.startswith('http://') and not url.startswith('https://'):
            url = 'https://' + url

        try:
            new_link = QuickLink(
                user_id=user_id,
                title=title,
                url=url,
                icon_url=icon_url
            )
            db.session.add(new_link)
            db.session.commit()
            return jsonify({
                "status": "success", 
                "message": "링크가 추가되었습니다.",
                "link": {"id": new_link.entry_id, "title": new_link.title, "url": new_link.url, "icon_url": new_link.icon_url}
            }), 201
        except Exception as e:
            db.session.rollback()
            print(f"Error adding quick link: {e}")
            return jsonify({"status": "error", "message": "링크 추가 중 오류 발생"}), 500

@app.route('/api/quick-links/<int:link_id>', methods=['DELETE'])
@login_required
def delete_quick_link(link_id):
    user_id = session['student_id']
    
    try:
        link = QuickLink.query.get(link_id)
        if not link:
            return jsonify({"status": "error", "message": "링크를 찾을 수 없습니다."}), 404
        
        if link.user_id != user_id:
            return jsonify({"status": "error", "message": "삭제 권한이 없습니다."}), 403
            
        db.session.delete(link)
        db.session.commit()
        return jsonify({"status": "success", "message": "링크가 삭제되었습니다."})
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting quick link: {e}")
        return jsonify({"status": "error", "message": "링크 삭제 중 오류 발생"}), 500


if __name__ == '__main__':
    create_initial_data() # 앱 실행 전 DB 확인 및 생성
    app.run(debug=True, port=2424)