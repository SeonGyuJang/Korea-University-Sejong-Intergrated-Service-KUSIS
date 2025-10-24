"""
셔틀버스 스케줄 서비스
"""
import csv
import os

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
BUS_TIME_PATH = os.path.join(BASE_DIR, 'schedules', 'bus_time.csv')

def load_bus_schedule():
    """셔틀버스 스케줄 CSV 파일 로드 및 파싱"""
    schedule = []
    try:
        with open(BUS_TIME_PATH, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                note = row.get('Note', '').strip()
                route = row.get('Route', '')

                if route == 'Station_to_School':
                    route_kr = '조치원역 → 학교'
                elif route == 'School_to_Station':
                    route_kr = '학교 → 조치원역'
                elif route == 'Station_to_Osong':
                    route_kr = '조치원역 → 오송역'
                elif route == 'School_to_Osong':
                    route_kr = '학교 → 조치원역/오송역'
                else:
                    route_kr = route

                route_group = "Jochiwon"
                if '오송역' in note or route.endswith('Osong'):
                    route_group = "Osong_Included"
                    if route == 'Station_to_School':
                        route_kr = '조치원/오송역 → 학교 (경유)'
                    elif route == 'School_to_Station':
                        route_kr = '학교 → 조치원역/오송역 (경유)'

                type_kr = '평일' if row.get('Type') == 'Weekday' else '일요일' if row.get('Type') == 'Sunday' else '기타'

                schedule.append({
                    "time": row.get('Departure_Time'),
                    "route": route_kr,
                    "type": type_kr,
                    "note": note,
                    "route_group": route_group
                })
        return schedule
    except Exception as e:
        print(f"Error loading bus schedule: {e}")
        return []
