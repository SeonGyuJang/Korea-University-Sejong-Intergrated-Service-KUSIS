"""
학기 관리 서비스
학사일정 로드, 학기 데이터 생성 및 관리
"""
import csv
import os
from datetime import date, datetime
from utils.constants import SEASONS, SEMESTER_YEAR_RANGE

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
CALENDAR_PATH = os.path.join(BASE_DIR, 'schedules', 'Calendar.csv')

def load_academic_calendar():
    """학사일정 CSV 파일에서 개강일 정보를 로드"""
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

def _get_semester_start_date_fallback(year, season):
    """학사일정에 없을 때 기본 개강일 반환"""
    if "1학기" in season:
        return date(year, 3, 1)
    elif "2학기" in season:
        return date(year, 9, 1)
    elif "여름학기" in season:
        return date(year, 6, 20)
    elif "겨울학기" in season:
        return date(year, 12, 20)
    return date(year, 1, 1)

def get_semester_start_date(year, season):
    """학사일정에서 학기 시작일을 조회"""
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

def create_semesters_for_user(user_id):
    """사용자에게 학기 데이터를 생성"""
    from models import Semester, db

    try:
        start_year, end_year = SEMESTER_YEAR_RANGE
        for year in range(start_year, end_year + 1):
            for season in SEASONS:
                semester_name = f"{year}년 {season}"
                existing_semester = Semester.query.filter_by(user_id=user_id, name=semester_name).first()
                if not existing_semester:
                    start_date = get_semester_start_date(year, season)
                    new_semester = Semester(user_id=user_id, name=semester_name, year=year, season=season, start_date=start_date)
                    db.session.add(new_semester)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"Error creating semesters for user {user_id}: {e}")

def manage_semesters_job(app):
    """매년 12월 1일에 다음 년도 학기 데이터 자동 생성"""
    from models import User, Semester, db

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
                            start_date = get_semester_start_date(next_year, season)
                            new_semester = Semester(user_id=user.id, name=semester_name, year=next_year, season=season, start_date=start_date)
                            db.session.add(new_semester)

            db.session.commit()
            print(f"[{datetime.now()}] Semester management job finished.")
        except Exception as e:
            db.session.rollback()
            print(f"[{datetime.now()}] ERROR in semester management job: {e}")
