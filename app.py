from flask import Flask, render_template, jsonify, request
from datetime import datetime, timedelta
import json
import csv
import os

app = Flask(__name__)

# 파일 경로 설정 (app.py 기준)
BUS_TIME_PATH = os.path.join(os.path.dirname(__file__), 'schedules', 'bus_time.csv')
STUDENT_MENU_PATH = os.path.join(os.path.dirname(__file__), 'menu_data', 'student_menu.json')
STAFF_MENU_PATH = os.path.join(os.path.dirname(__file__), 'menu_data', 'staff_menu.json')

# --- 데이터 로드 및 정제 함수 ---

def load_bus_schedule():
    """/schedules/bus_time.csv 파일을 읽고 셔틀버스 시간표 데이터를 정제하여 로드"""
    schedule = []
    try:
        with open(BUS_TIME_PATH, 'r', encoding='utf-8') as f:
            # 첫 번째 줄은 'Departure_Time,Route,Type,Note' 형태이므로 스킵
            next(f) 
            reader = csv.DictReader(f, fieldnames=['Departure_Time', 'Route', 'Type', 'Note'])
            for row in reader:
                # 데이터 정제 및 변환
                route_map = {
                    'Station_to_School': '조치원/오송역 → 학교',
                    'School_to_Station': '학교 → 조치원역',
                    'Station_to_Osong': '조치원역 → 오송역',
                    'School_to_Osong': '학교 → 조치원역/오송역'
                }
                
                route_kr = route_map.get(row['Route'], row['Route'])
                type_kr = '평일' if row['Type'] == 'Weekday' else '일요일' if row['Type'] == 'Sunday' else '기타'
                
                # 클라이언트에서 사용할 상태 추가 (status 대신 time만 넘김. 클라이언트에서 현재 시간에 맞춰 계산)
                schedule.append({
                    "time": row['Departure_Time'],
                    "route": route_kr,
                    "type": type_kr,
                    "note": row['Note'].strip(),
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
            data['student'] = json.load(f)['메뉴']
        with open(STAFF_MENU_PATH, 'r', encoding='utf-8') as f:
            data['faculty'] = json.load(f)['메뉴']
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
    
    # 메뉴 리스트를 문자열로 변환 (알레르기, 칼로리 정보 제거)
    def menu_to_string(menu_list):
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

# 전역 변수로 데이터 로드 및 오늘의 식단 키 설정
SHUTTLE_SCHEDULE_DATA = load_bus_schedule()
MEAL_PLAN_DATA = load_meal_data()
TODAY_MEAL_KEY = get_today_meal_key()


# --- API 엔드포인트 ---

@app.route('/')
def index():
    return render_template('index.html')

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
def get_schedule():
    return jsonify(SCHEDULE_DATA)

@app.route('/api/timetable', methods=['GET', 'POST'])
def handle_timetable():
    if request.method == 'GET':
        return jsonify(TIMETABLE)
    elif request.method == 'POST':
        data = request.json
        # 메모 업데이트 로직 (실제로는 DB에 저장)
        return jsonify({"status": "success"})

@app.route('/api/study-time', methods=['POST'])
def save_study_time():
    data = request.json
    # 실제로는 DB에 저장
    return jsonify({"status": "success", "data": data})

if __name__ == '__main__':
    app.run(debug=True, port=2424)