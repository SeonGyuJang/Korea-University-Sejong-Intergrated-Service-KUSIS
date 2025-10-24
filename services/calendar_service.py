"""
캘린더 관리 서비스
학사일정, 공휴일, 개인 일정 관리
"""
import csv
import os
from datetime import date, datetime

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
CALENDAR_PATH = os.path.join(BASE_DIR, 'schedules', 'Calendar.csv')
HOLIDAYS_PATH = os.path.join(BASE_DIR, 'schedules', 'holidays.csv')


def load_holidays():
    """공휴일 CSV 파일 로드"""
    holidays = []
    try:
        with open(HOLIDAYS_PATH, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                holidays.append({
                    'year': int(row['year']),
                    'month': int(row['month']),
                    'day': int(row['day']),
                    'name': row['name'],
                    'is_substitute': bool(int(row['is_substitute']))
                })
    except Exception as e:
        print(f"Error loading holidays: {e}")
    return holidays


def load_academic_schedule():
    """학사일정 CSV 파일 로드"""
    schedules = []
    try:
        with open(CALENDAR_PATH, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            for row in reader:
                if len(row) >= 4:
                    year, month, day, event_name = row[0:4]
                    try:
                        # 날짜 범위 파싱 (예: "3,4~21" -> "4~21")
                        day_str = day.strip()

                        # 기간이 있는 경우 (예: "4~21", "1~3")
                        if '~' in day_str:
                            start_day, end_day = day_str.split('~')
                            start_day = int(start_day.strip())
                            end_day = int(end_day.strip())

                            schedules.append({
                                'year': int(year),
                                'month': int(month),
                                'start_day': start_day,
                                'end_day': end_day,
                                'title': event_name.strip(),
                                'is_range': True
                            })
                        else:
                            # 단일 날짜
                            schedules.append({
                                'year': int(year),
                                'month': int(month),
                                'start_day': int(day_str),
                                'end_day': None,
                                'title': event_name.strip(),
                                'is_range': False
                            })
                    except ValueError as ve:
                        print(f"Error parsing date in row {row}: {ve}")
                        continue
    except Exception as e:
        print(f"Error loading academic schedule: {e}")
    return schedules


def initialize_system_categories():
    """시스템 카테고리 초기화 (학사일정, 공휴일)"""
    from models import db, CalendarCategory

    try:
        # 학사일정 카테고리
        academic_category = CalendarCategory.query.filter_by(
            name='학사일정',
            is_system=True,
            user_id=None
        ).first()

        if not academic_category:
            academic_category = CalendarCategory(
                user_id=None,
                name='학사일정',
                color='#2E7D32',  # 초록색
                is_system=True
            )
            db.session.add(academic_category)

        # 공휴일 카테고리
        holiday_category = CalendarCategory.query.filter_by(
            name='공휴일',
            is_system=True,
            user_id=None
        ).first()

        if not holiday_category:
            holiday_category = CalendarCategory(
                user_id=None,
                name='공휴일',
                color='#D32F2F',  # 빨간색
                is_system=True
            )
            db.session.add(holiday_category)

        db.session.commit()
        return academic_category.id, holiday_category.id
    except Exception as e:
        db.session.rollback()
        print(f"Error initializing system categories: {e}")
        return None, None


def initialize_system_events():
    """시스템 이벤트 초기화 (학사일정, 공휴일)"""
    from models import db, CalendarCategory, CalendarEvent

    try:
        # 카테고리 가져오기
        academic_category = CalendarCategory.query.filter_by(
            name='학사일정',
            is_system=True
        ).first()

        holiday_category = CalendarCategory.query.filter_by(
            name='공휴일',
            is_system=True
        ).first()

        if not academic_category or not holiday_category:
            print("System categories not found. Please initialize categories first.")
            return

        # 기존 시스템 이벤트 삭제 (업데이트를 위해)
        CalendarEvent.query.filter_by(is_system=True).delete()

        # 학사일정 로드
        academic_schedules = load_academic_schedule()
        for schedule in academic_schedules:
            try:
                start_date = date(schedule['year'], schedule['month'], schedule['start_day'])
                end_date = None

                if schedule['is_range'] and schedule['end_day']:
                    end_date = date(schedule['year'], schedule['month'], schedule['end_day'])

                event = CalendarEvent(
                    user_id=None,
                    category_id=academic_category.id,
                    title=schedule['title'],
                    start_date=start_date,
                    end_date=end_date,
                    all_day=True,
                    is_system=True
                )
                db.session.add(event)
            except Exception as e:
                print(f"Error creating academic event: {e}")
                continue

        # 공휴일 로드
        holidays = load_holidays()
        for holiday in holidays:
            try:
                holiday_date = date(holiday['year'], holiday['month'], holiday['day'])

                event = CalendarEvent(
                    user_id=None,
                    category_id=holiday_category.id,
                    title=holiday['name'],
                    start_date=holiday_date,
                    all_day=True,
                    is_system=True
                )
                db.session.add(event)
            except Exception as e:
                print(f"Error creating holiday event: {e}")
                continue

        db.session.commit()
        print("System events initialized successfully.")
    except Exception as e:
        db.session.rollback()
        print(f"Error initializing system events: {e}")


def create_default_categories_for_user(user_id):
    """사용자를 위한 기본 개인 카테고리 생성"""
    from models import db, CalendarCategory

    try:
        default_categories = [
            {'name': '개인', 'color': '#1976D2'},  # 파란색
            {'name': '공부', 'color': '#7B1FA2'},  # 보라색
            {'name': '운동', 'color': '#F57C00'},  # 주황색
            {'name': '약속', 'color': '#C2185B'},  # 핑크색
        ]

        for cat_data in default_categories:
            existing = CalendarCategory.query.filter_by(
                user_id=user_id,
                name=cat_data['name']
            ).first()

            if not existing:
                category = CalendarCategory(
                    user_id=user_id,
                    name=cat_data['name'],
                    color=cat_data['color'],
                    is_system=False
                )
                db.session.add(category)

        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"Error creating default categories for user {user_id}: {e}")
