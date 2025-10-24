"""
유틸리티 헬퍼 함수
"""
from .constants import SEASON_ORDER, GRADE_MAP

def sort_semesters(semesters, reverse=True):
    """학기 리스트를 연도와 계절 순서로 정렬"""
    return sorted(semesters, key=lambda s: (s.year, SEASON_ORDER.get(s.season, 99)), reverse=reverse)

def calculate_gpa(subjects):
    """과목 리스트에서 GPA 계산"""
    total_credits = 0
    total_score = 0
    earned_credits = sum(s.credits for s in subjects)

    for subject in subjects:
        grade_score = GRADE_MAP.get(subject.grade)
        if grade_score is not None:
            total_credits += subject.credits
            total_score += (grade_score * subject.credits)

    gpa = (total_score / total_credits) if total_credits > 0 else 0.0
    return {
        'gpa': round(gpa, 2),
        'total_credits': total_credits,
        'earned_credits': earned_credits
    }

def allowed_file(filename, allowed_extensions):
    """파일 확장자 검증"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in allowed_extensions
