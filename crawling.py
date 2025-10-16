import requests
from bs4 import BeautifulSoup
import json
from datetime import datetime
import os

def extract_menu_items(cell):
    """td 셀에서 메뉴 항목들을 추출하는 함수"""
    menu_text = cell.find('p', class_='offTxt')
    if menu_text:
        # <br/> 태그를 기준으로 메뉴 항목 분리
        menu_items = [item.strip() for item in menu_text.stripped_strings]
        return [item for item in menu_items if item.strip()]
    return []

def extract_time(th_text):
    """시간 정보를 추출하는 함수"""
    if '(' in th_text and ')' in th_text:
        time_part = th_text[th_text.find("(")+1:th_text.find(")")]
        return time_part.strip()
    return ""

def get_meal_type(meal_info):
    """식사 종류를 결정하는 함수"""
    if '조식' in meal_info:
        return "조식"
    elif '중식' in meal_info:
        if '한식' in meal_info:
            return "중식-한식"
        elif '일품' in meal_info:
            return "중식-일품"
        elif '분식' in meal_info:
            return "중식-분식"
        elif 'plus' in meal_info.lower():
            return "중식-plus"
        return "중식"
    elif '석식' in meal_info:
        return "석식"
    return "기타"

def process_menu_table(table, menu_dict):
    """테이블에서 메뉴 데이터를 추출하는 함수"""
    headers = [th.text.strip() for th in table.find('thead').find_all('th')]
    dates = headers[1:]  # 첫 번째 열 제외
    
    # 각 날짜별 메뉴 데이터 초기화
    for date in dates:
        date = date.strip().replace(' ', '')
        menu_dict[date] = {}
    
    # 각 행(식사 종류)별 처리
    rows = table.find('tbody').find_all('tr')
    for row in rows:
        meal_info = row.find('th').text.strip()
        meal_type = get_meal_type(meal_info)
        time_slot = extract_time(meal_info)
        
        cells = row.find_all('td')
        for date, cell in zip(dates, cells):
            date = date.strip().replace(' ', '')
            menu_items = extract_menu_items(cell)
            
            if menu_items:
                menu_dict[date][meal_type] = {
                    "시간": time_slot,
                    "메뉴": menu_items
                }

def crawl_and_save_menu():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    save_dir = os.path.join(current_dir, 'menu_data')
    
    if not os.path.exists(save_dir):
        os.makedirs(save_dir)
    
    url = 'https://sejong.korea.ac.kr/dietMa/koreaSejong/artclView.do'
    
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        
        if not response.text.strip():
            print("빈 응답을 받았습니다.")
            return None
            
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # 학생 식단표와 교직원 식단표 찾기
        student_menu = soup.find_all('div', class_='diet-menu')[1]
        staff_menu = soup.find_all('div', class_='diet-menu')[0]
        
        # 날짜 정보 추출
        date_range = student_menu.find('p', class_='title').text.split(' ')[0:3]
        period_info = {
            "시작일": date_range[0],
            "종료일": date_range[2]
        }
        
        # 학생 식단표 처리
        student_data = {
            "기간": period_info,
            "메뉴": {}
        }
        student_table = student_menu.find('table')
        process_menu_table(student_table, student_data["메뉴"])
        
        # 교직원 식단표 처리
        staff_data = {
            "기간": period_info,
            "메뉴": {}
        }
        staff_table = staff_menu.find('table')
        process_menu_table(staff_table, staff_data["메뉴"])
        
        # 각각 JSON 파일로 저장
        student_file_path = os.path.join(save_dir, 'student_menu.json')
        staff_file_path = os.path.join(save_dir, 'staff_menu.json')
        
        with open(student_file_path, 'w', encoding='utf-8') as f:
            json.dump(student_data, f, ensure_ascii=False, indent=2)
            
        with open(staff_file_path, 'w', encoding='utf-8') as f:
            json.dump(staff_data, f, ensure_ascii=False, indent=2)
        
        print("메뉴 데이터가 성공적으로 저장되었습니다.")
        
        return {
            "학생식당": student_data,
            "교직원식당": staff_data
        }
        
    except Exception as e:
        print(f"크롤링 중 오류 발생: {e}")
        return None

# 실행
if __name__ == "__main__":
    menu_data = crawl_and_save_menu()
    if menu_data:
        print("\n변환된 JSON 데이터 예시:")
        print(json.dumps(menu_data, ensure_ascii=False, indent=2))