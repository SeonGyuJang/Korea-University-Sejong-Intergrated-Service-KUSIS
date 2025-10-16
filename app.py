from flask import Flask, render_template, jsonify, request
from datetime import datetime, timedelta
import json

app = Flask(__name__)

# 샘플 데이터
SHUTTLE_SCHEDULE = [
    {"time": "08:00", "route": "세종 → 서울", "status": "운행예정"},
    {"time": "09:30", "route": "세종 → 서울", "status": "운행예정"},
    {"time": "12:00", "route": "서울 → 세종", "status": "운행중"},
    {"time": "14:30", "route": "세종 → 서울", "status": "운행예정"},
    {"time": "17:00", "route": "서울 → 세종", "status": "운행예정"},
    {"time": "19:00", "route": "서울 → 세종", "status": "운행예정"},
]

MEAL_PLAN = {
    "student": {
        "breakfast": "김치찌개, 계란후라이, 김, 깍두기",
        "lunch": "돈까스, 스파게티, 샐러드, 과일",
        "dinner": "제육볶음, 된장찌개, 나물, 김치"
    },
    "faculty": {
        "breakfast": "미역국, 불고기, 계란찜, 김치",
        "lunch": "비빔밥, 된장찌개, 튀김, 과일",
        "dinner": "삼겹살, 김치찌개, 쌈채소, 된장"
    }
}

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

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/shuttle')
def get_shuttle():
    return jsonify(SHUTTLE_SCHEDULE)

@app.route('/api/meal')
def get_meal():
    cafeteria = request.args.get('cafeteria', 'student')
    return jsonify(MEAL_PLAN.get(cafeteria, MEAL_PLAN['student']))

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
    app.run(debug=True, port=5000)