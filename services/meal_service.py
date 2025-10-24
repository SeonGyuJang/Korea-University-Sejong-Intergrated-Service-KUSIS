"""
식단 정보 서비스
"""
import json
import os
from datetime import datetime
import pytz

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
STUDENT_MENU_PATH = os.path.join(BASE_DIR, 'menu_data', 'student_menu.json')
STAFF_MENU_PATH = os.path.join(BASE_DIR, 'menu_data', 'staff_menu.json')

KST = pytz.timezone('Asia/Seoul')

def load_meal_data():
    """식단 JSON 파일 로드"""
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
    """오늘 날짜의 식단 키 반환 (예: '3.15(월)')"""
    today_kst = datetime.now(KST)
    day_of_week_kr = ['월', '화', '수', '목', '금', '토', '일'][today_kst.weekday()]
    return f"{today_kst.month}.{today_kst.day}({day_of_week_kr})"

def _menu_to_string(menu_list):
    """메뉴 리스트를 정리하여 문자열로 변환"""
    if not menu_list:
        return ""

    cleaned_menu = []
    for item in menu_list:
        if item and not item.lower().endswith('kcal') and not item.isdigit() and 'kcal' not in item.lower():
            item_cleaned = item.split('(')[0].strip()
            if item_cleaned:
                cleaned_menu.append(item_cleaned)

    unique_menu = sorted(list(set(cleaned_menu)))
    return ", ".join(unique_menu)

def format_meal_for_client(menu_data, target_date_key, cafeteria_type):
    """클라이언트용 식단 정보 포맷팅"""
    formatted_menu = {
        "breakfast": "식단 정보 없음",
        "lunch": "식단 정보 없음",
        "dinner": "식단 정보 없음"
    }
    daily_menu = menu_data.get(target_date_key, {})

    if cafeteria_type == 'student':
        formatted_menu['lunch'] = {
            'korean': "식단 정보 없음",
            'ala_carte': "식단 정보 없음",
            'snack_plus': "식단 정보 없음"
        }

        if '조식' in daily_menu:
            formatted_menu['breakfast'] = _menu_to_string(daily_menu['조식'].get('메뉴', []))

        if '중식-한식' in daily_menu:
            formatted_menu['lunch']['korean'] = _menu_to_string(daily_menu['중식-한식'].get('메뉴', []))

        ala_carte_items = []
        if '중식-일품' in daily_menu:
            ilpum_str = _menu_to_string(daily_menu['중식-일품'].get('메뉴', []))
            if ilpum_str:
                ala_carte_items.append("일품: " + ilpum_str)
        if '중식-분식' in daily_menu:
            bunsik_str = _menu_to_string(daily_menu['중식-분식'].get('메뉴', []))
            if bunsik_str:
                ala_carte_items.append("분식: " + bunsik_str)

        if ala_carte_items:
            formatted_menu['lunch']['ala_carte'] = " / ".join(ala_carte_items)

        if '중식-plus' in daily_menu:
            formatted_menu['lunch']['snack_plus'] = _menu_to_string(daily_menu['중식-plus'].get('메뉴', []))

        if '석식' in daily_menu:
            formatted_menu['dinner'] = _menu_to_string(daily_menu['석식'].get('메뉴', []))

    elif cafeteria_type == 'faculty':
        formatted_menu['breakfast'] = "조식 제공 없음"
        formatted_menu['dinner'] = "석식 제공 없음"

        if '중식' in daily_menu:
            formatted_menu['lunch'] = _menu_to_string(daily_menu['중식'].get('메뉴', []))

    return formatted_menu

def format_weekly_meal_for_client(weekly_meal_data):
    """주간 식단 정보 포맷팅"""
    formatted_data = {
        "기간": weekly_meal_data.get('student_period', weekly_meal_data.get('faculty_period', {})),
        "식단": {
            "student": weekly_meal_data.get('student', {}),
            "faculty": weekly_meal_data.get('faculty', {})
        }
    }
    return formatted_data
