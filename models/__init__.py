"""
데이터베이스 모델 패키지
"""
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

from .user import User
from .semester import Semester
from .subject import Subject, TimeSlot
from .schedule import Schedule
from .study import StudyLog
from .todo import Todo
from .post import Post
from .calendar import CalendarCategory, CalendarEvent
# --- [신규] 커뮤니티 모델 임포트 ---
from .community import Comment, PostLike

__all__ = [
    'db', 'User', 'Semester', 'Subject', 'TimeSlot', 
    'Schedule', 'StudyLog', 'Todo', 'Post', 
    'CalendarCategory', 'CalendarEvent',
    # --- [신규] __all__에 추가 ---
    'Comment', 'PostLike'
]