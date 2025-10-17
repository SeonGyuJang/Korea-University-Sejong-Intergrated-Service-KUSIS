from flask import Flask, render_template, jsonify, request, redirect, url_for, session, flash
from datetime import datetime, timedelta
import json
import csv
import os
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash # 비밀번호 해싱을 위해 werkzeug 사용

app = Flask(__name__)

# --- Configuration for Session & Security ---
# 세션 관리를 위한 비밀 키 설정 (실제 환경에서는 외부에 저장해야 함)
app.secret_key = 'your_super_secret_key_for_session_management' 
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=1) 
app.config['SESSION_TYPE'] = 'filesystem' 

# 파일 경로 설정 (app.py 기준)
BUS_TIME_PATH = os.path.join(os.path.dirname(__file__), 'schedules', 'bus_time.csv')
STUDENT_MENU_PATH = os.path.join(os.path.dirname(__file__), 'menu_data', 'student_menu.json')
STAFF_MENU_PATH = os.path.join(os.path.dirname(__file__), 'menu_data', 'staff_menu.json')


# --- New Data Structures for Users/Admin ---

# 단과대학 및 학과 리스트 (회원가입 시 선택 옵션)
COLLEGES = {
    "과학기술대학": ["응용수리과학부 데이터계산과학전공", "인공지능사이버보안학과", "컴퓨터융합소프트웨어학과", "전자및정보공학과", "전자기계융합공학과", "환경시스템공학과", "지능형반도체공학과", "반도체물리학부", "생명정보공학과", "신소재화학과", "식품생명공학과", "미래모빌리티학과", "디지털헬스케어공학과", "자유공학부"],
    "글로벌비즈니스대학": ["글로벌학부 한국학전공", "글로벌학부 중국학전공", "글로벌학부 영미학전공", "글로벌학부 독일학전공", "융합경영학부 글로벌경영전공", "융합경영학부 디지털경영전공", "표준지식학과"],
    "공공정책대학": ["정부행정학부", "공공사회통일외교학부 공공사회학전공", "공공사회통일외교학부 통일외교안보전공", "경제통계학부 경제정책학전공", "빅데이터사이언스학부"],
    "문화스포츠대학": ["국제스포츠학부 스포츠과학전공", "국제스포츠학부 스포츠비즈니스전공", "문화유산융합학부", "문화창의학부 미디어문예창작전공", "문화창의학부 문화콘텐츠전공"],
    "약학대학": ["약학과", "첨단융합신약학과"],
    "스마트도시학부": ["스마트도시학부"]
}

# 사용자 데이터 저장소 (DB 대신 메모리 딕셔너리 사용)
# key: student_id, value: {name, dob, college, department, password_hash, is_admin}
USERS = {
    "9999123456": { # 관리자 계정 (기본)
        "name": "admin", 
        "dob": "2004-06-16", 
        "college": "관리자", 
        "department": "관리팀", 
        "password_hash": generate_password_hash("1234"), 
        "is_admin": True
    },
    "2023390822": { # 샘플 사용자 계정
        "name": "장선규", 
        "dob": "2004-03-24", 
        "college": "과학기술대학", 
        "department": "컴퓨터융합소프트웨어학과", 
        "password_hash": generate_password_hash("password123"), 
        "is_admin": False
    }
}

# --- Authentication/Authorization Decorators ---

def login_required(f):
    """로그인 필수 데코레이터"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'student_id' not in session:
            flash("로그인이 필요합니다.", "warning")
            return redirect(url_for('login', next=request.url))
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    """관리자 권한 필수 데코레이터"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'student_id' not in session or not USERS.get(session['student_id'], {}).get('is_admin', False):
            flash("접근 권한이 없습니다. 관리자만 접근 가능합니다.", "danger")
            return redirect(url_for('index'))
        return f(*args, **kwargs)
    return decorated_function


# --- 데이터 로드 및 정제 함수 (기존 코드 유지) ---

def load_bus_schedule():
    """/schedules/bus_time.csv 파일을 읽고 셔틀버스 시간표 데이터를 정제하여 로드"""
    schedule = []
    try:
        with open(BUS_TIME_PATH, 'r', encoding='utf-8') as f:
            # 첫 번째 줄은 'Departure_Time,Route,Type,Note' 형태이므로 스킵
            next(f) 
            reader = csv.DictReader(f, fieldnames=['Departure_Time', 'Route', 'Type', 'Note'])
            for row in reader:
                note = row['Note'].strip()
                
                # 기본 매핑 설정 (조치원 전용으로 간주)
                if row['Route'] == 'Station_to_School':
                    route_kr = '조치원역 → 학교'
                elif row['Route'] == 'School_to_Station':
                    route_kr = '학교 → 조치원역'
                elif row['Route'] == 'Station_to_Osong':
                    route_kr = '조치원역 → 오송역'
                elif row['Route'] == 'School_to_Osong':
                    route_kr = '학교 → 조치원역/오송역'
                else:
                    route_kr = row['Route']
                    
                # 오송역 노선 특수 처리: Note에 '오송역'이 명시된 경우 노선명을 변경하고 그룹을 설정
                if '오송역' in note:
                    if row['Route'] == 'Station_to_School':
                         route_kr = '조치원/오송역 → 학교 (경유)'
                    elif row['Route'] == 'School_to_Station':
                         route_kr = '학교 → 조치원역/오송역 (경유)'
                         
                # 그룹 설정: Osong_Included 그룹은 별도 노선(Osong) 또는 Note에 '오송역'이 포함된 노선
                route_group = "Jochiwon"
                if '오송역' in note or row['Route'].endswith('Osong'):
                    route_group = "Osong_Included"


                type_kr = '평일' if row['Type'] == 'Weekday' else '일요일' if row['Type'] == 'Sunday' else '기타'
                
                schedule.append({
                    "time": row['Departure_Time'],
                    "route": route_kr,
                    "type": type_kr,
                    "note": note,
                    "route_group": route_group # JS에서 노선 그룹 분류를 위한 필드 추가
                })
        return schedule
    except Exception as e:
        print(f"Error loading bus schedule: {e}")
        return []

def load_meal_data():
    """식단 JSON 파일을 읽어 메모리에 로드"""
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
    """현재 날짜에 해당하는 식단 키(예: 10.16(목))를 반환. (파일 기간에 맞춰 2025/10/16을 고정 사용)"""
    # 실제 시스템에서는 datetime.now()를 사용해야 하지만, 제공된 파일의 데이터(10.13~10.19)에 맞춰 10월 16일 고정
    today = datetime(2025, 10, 16)
    day_of_week_kr = ['월', '화', '수', '목', '금', '토', '일'][today.weekday()]
    return f"{today.month}.{today.day}({day_of_week_kr})"

def menu_to_string(menu_list):
    """메뉴 리스트를 문자열로 변환 (알레르기, 칼로리 정보 제거)"""
    cleaned_menu = [
        item.strip() for item in menu_list 
        if not item.lower().endswith('kcal') and 
        not item.isdigit() and 
        'kcal' not in item.lower()
    ]
    # 괄호와 그 안의 내용 제거 (알레르기 정보)
    cleaned_menu = [item.split('(')[0].strip() for item in cleaned_menu]
    
    # 빈 문자열 및 중복 제거 후 반환
    return ", ".join(sorted(list(set(item for item in cleaned_menu if item))))
    
def format_meal_for_client(menu_data, target_date_key, cafeteria_type):
    """API 응답 형식에 맞게 식단 데이터를 정제 (중식 3단계 분리 반영)"""
    formatted_menu = {
        "breakfast": "식단 정보 없음",
        "lunch": "식단 정보 없음", # 교직원용 기본값
        "dinner": "식단 정보 없음"
    }

    # 학생 식당의 경우 중식 구조를 객체로 변경
    if cafeteria_type == 'student':
        formatted_menu['lunch'] = {
            'korean': "식단 정보 없음",
            'ala_carte': "식단 정보 없음",
            'snack_plus': "식단 정보 없음",
        }
        
    daily_menu = menu_data.get(target_date_key, {})
    
    if cafeteria_type == 'student':
        # 학생 식당 (조식, 중식-한식/일품/분식/plus, 석식)
        
        if '조식' in daily_menu:
            formatted_menu['breakfast'] = menu_to_string(daily_menu['조식']['메뉴'])
        
        # 중식 1: 한식
        if '중식-한식' in daily_menu: 
            formatted_menu['lunch']['korean'] = menu_to_string(daily_menu['중식-한식']['메뉴'])

        # 중식 2: 일품/분식 (Combined)
        ala_carte_items = []
        if '중식-일품' in daily_menu: 
            ala_carte_items.append("일품: " + menu_to_string(daily_menu['중식-일품']['메뉴']))
        if '중식-분식' in daily_menu: 
            ala_carte_items.append("분식: " + menu_to_string(daily_menu['중식-분식']['메뉴']))
        
        if ala_carte_items:
            formatted_menu['lunch']['ala_carte'] = " / ".join(ala_carte_items)

        # 중식 3: Plus
        if '중식-plus' in daily_menu: 
            formatted_menu['lunch']['snack_plus'] = menu_to_string(daily_menu['중식-plus']['메뉴'])
        
        
        if '석식' in daily_menu:
            formatted_menu['dinner'] = menu_to_string(daily_menu['석식']['메뉴'])

    elif cafeteria_type == 'faculty':
        # 교직원 식당 (중식만 있음)
        formatted_menu['breakfast'] = "조식 제공 없음"
        formatted_menu['dinner'] = "석식 제공 없음"
        
        if '중식' in daily_menu:
            formatted_menu['lunch'] = menu_to_string(daily_menu['중식']['메뉴'])
            
    return formatted_menu

def format_weekly_meal_for_client(weekly_meal_data):
    """주간 식단 데이터를 API 응답 형식에 맞게 정제"""
    formatted_data = {
        "기간": weekly_meal_data.get('student_period', weekly_meal_data.get('faculty_period', {})),
        "식단": {}
    }
    
    # 모든 날짜 키를 추출하고 정렬합니다. 
    all_date_keys = sorted(set(weekly_meal_data['student'].keys()).union(set(weekly_meal_data['faculty'].keys())))
    
    for cafeteria_type in ['student', 'faculty']:
        formatted_data['식단'][cafeteria_type] = {}
        menu_data = weekly_meal_data.get(cafeteria_type, {})
        
        for date_key in all_date_keys:
            # format_meal_for_client 재사용하여 일별 정제
            formatted_data['식단'][cafeteria_type][date_key] = format_meal_for_client(
                menu_data, date_key, cafeteria_type
            )
            
    return formatted_data


# 전역 변수로 데이터 로드 및 오늘의 식단 키 설정
SHUTTLE_SCHEDULE_DATA = load_bus_schedule()
MEAL_PLAN_DATA = load_meal_data()
TODAY_MEAL_KEY = get_today_meal_key()


# --- API 및 페이지 엔드포인트 ---

@app.route('/')
def index():
    # 세션에서 사용자 정보 로드
    user_info = None
    is_admin = False
    if 'student_id' in session and session['student_id'] in USERS:
        user_info = USERS[session['student_id']]
        is_admin = user_info.get('is_admin', False)
        
    # user와 is_admin을 템플릿에 전달하여 로그인 상태와 권한에 따라 화면을 다르게 표시
    return render_template('index.html', user=user_info, is_admin=is_admin)


# --- New Authentication Routes ---

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        student_id = request.form.get('student_id')
        password = request.form.get('password')
        
        user = USERS.get(student_id)
        
        if user and check_password_hash(user['password_hash'], password):
            session.clear()
            session['student_id'] = student_id
            flash(f"{user['name']}님, KUSIS에 오신 것을 환영합니다.", "success")
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
        
        # 1. 유효성 검사
        if not (name and student_id and password and password_confirm and dob and college and department):
            flash("모든 필드를 입력해주세요.", "danger")
            # POST 요청 실패 시에도 colleges 데이터를 다시 전달해야 select 옵션이 유지됨
            return render_template('register.html', colleges=COLLEGES)
            
        if password != password_confirm:
            flash("비밀번호 확인이 일치하지 않습니다.", "danger")
            return render_template('register.html', colleges=COLLEGES)
            
        if len(student_id) != 10 or not student_id.isdigit():
             flash("학번은 10자리 숫자여야 합니다.", "danger")
             return render_template('register.html', colleges=COLLEGES)
        
        if student_id in USERS:
            flash("이미 등록된 학번입니다.", "danger")
            return render_template('register.html', colleges=COLLEGES)
            
        if college not in COLLEGES or department not in COLLEGES.get(college, []):
            flash("유효하지 않은 단과대학/학과 선택입니다.", "danger")
            return render_template('register.html', colleges=COLLEGES)
            
        # 2. 사용자 등록
        hashed_password = generate_password_hash(password)
        
        USERS[student_id] = {
            "name": name,
            "dob": dob,
            "college": college,
            "department": department,
            "password_hash": hashed_password,
            "is_admin": False
        }
        
        flash("회원가입이 성공적으로 완료되었습니다. 로그인해주세요.", "success")
        return redirect(url_for('login'))
        
    return render_template('register.html', colleges=COLLEGES)

# --- New Admin Route ---

@app.route('/admin')
@admin_required # 관리자 권한 필수
def admin_dashboard():
    member_count = len(USERS)
    member_list = sorted(
        [
            {
                "id": uid,
                "name": user["name"],
                "department": user["department"],
                "is_admin": user["is_admin"]
            } 
            for uid, user in USERS.items()
        ], 
        key=lambda x: x['id']
    )
    return render_template('admin.html', member_count=member_count, member_list=member_list)


# --- 기존 API 엔드포인트 (로그인 필수 추가) ---

@app.route('/api/shuttle')
def get_shuttle():
    """셔틀버스 전체 시간표 제공"""
    return jsonify(SHUTTLE_SCHEDULE_DATA)

@app.route('/api/meal')
def get_meal():
    """오늘의 식단 정보를 정제하여 제공"""
    cafeteria = request.args.get('cafeteria', 'student')
    
    if cafeteria in MEAL_PLAN_DATA:
        formatted_meal = format_meal_for_client(MEAL_PLAN_DATA[cafeteria], TODAY_MEAL_KEY, cafeteria)
        return jsonify(formatted_meal)
    
    # 오류 또는 데이터 없음 시 기본 응답
    if cafeteria == 'student':
         return jsonify({
            "breakfast": "식단 정보 없음",
            "lunch": {
                'korean': "식단 정보 없음",
                'ala_carte': "식단 정보 없음",
                'snack_plus': "식단 정보 없음",
            },
            "dinner": "식단 정보 없음"
        })
    else:
        return jsonify({
            "breakfast": "식단 정보 없음",
            "lunch": "식단 정보 없음",
            "dinner": "식단 정보 없음"
        })

@app.route('/api/meal/week')
def get_weekly_meal():
    """이번주 전체 식단표 정보를 정제하여 제공"""
    # MEAL_PLAN_DATA는 이미 로드된 주간 데이터입니다.
    formatted_data = format_weekly_meal_for_client(MEAL_PLAN_DATA)
    return jsonify(formatted_data)


# 샘플 데이터 (요청된 수정 사항이 아니므로 유지)
SCHEDULE_DATA = [
    {"time": "09:00", "title": "데이터베이스 설계", "location": "세종관 301호"},
    {"time": "13:00", "title": "웹 프로그래밍", "location": "창의관 205호"},
    {"time": "15:00", "title": "스터디 모임", "location": "도서관 4층"},
    {"time": "18:00", "title": "운동", "location": "체육관"},   
]

TIMETABLE = [
    {"day": 1, "period": 1, "subject": "데이터베이스", "professor": "김교수", "room": "세종관 301", "memo": ""},
    {"day": 1, "period": 3, "subject": "웹프로그래밍", "professor": "이교수", "room": "창의관 205", "memo": "과제 제출"},
    {"day": 2, "period": 2, "subject": "알고리즘", "professor": "박교수", "room": "세종관 405", "memo": ""},
    {"day": 3, "period": 1, "subject": "데이터베이스", "professor": "김교수", "room": "세종관 301", "memo": ""},
    {"day": 4, "period": 4, "subject": "컴퓨터구조", "professor": "최교수", "room": "창의관 301", "memo": "중간고사 준비"},
    {"day": 5, "period": 1, "subject": "운영체제", "professor": "정교수", "room": "세종관 501", "memo": ""},
]

@app.route('/api/schedule')
@login_required # 로그인 필수 추가
def get_schedule():
    return jsonify(SCHEDULE_DATA)

@app.route('/api/timetable', methods=['GET', 'POST'])
@login_required # 로그인 필수 추가
def handle_timetable():
    if request.method == 'GET':
        return jsonify(TIMETABLE)
    elif request.method == 'POST':
        data = request.json
        # 메모 업데이트 로직 (실제로는 DB에 저장)
        return jsonify({"status": "success"})

@app.route('/api/study-time', methods=['POST'])
@login_required # 로그인 필수 추가
def save_study_time():
    data = request.json
    # 실제로는 DB에 저장
    return jsonify({"status": "success", "data": data})

if __name__ == '__main__':
    app.run(debug=True, port=2424)