"""
캘린더 모델
"""
from datetime import datetime
from . import db

class CalendarCategory(db.Model):
    """캘린더 카테고리 모델"""
    __tablename__ = 'calendar_categories'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(10), db.ForeignKey('users.id'), nullable=True)  # NULL for system categories
    name = db.Column(db.String(100), nullable=False)
    color = db.Column(db.String(7), nullable=False)  # Hex color code (e.g., #FF5733)
    is_system = db.Column(db.Boolean, default=False, nullable=False)  # True for 학사일정, 공휴일
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationship
    events = db.relationship('CalendarEvent', backref='category', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'name': self.name,
            'color': self.color,
            'is_system': self.is_system,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class CalendarEvent(db.Model):
    """캘린더 이벤트 모델"""
    __tablename__ = 'calendar_events'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(10), db.ForeignKey('users.id'), nullable=True)  # NULL for system events
    category_id = db.Column(db.Integer, db.ForeignKey('calendar_categories.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date)  # NULL for single-day events
    start_time = db.Column(db.Time)  # NULL for all-day events
    end_time = db.Column(db.Time)  # NULL for all-day events
    all_day = db.Column(db.Boolean, default=True, nullable=False)
    is_system = db.Column(db.Boolean, default=False, nullable=False)  # True for 학사일정, 공휴일
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        """FullCalendar.js 형식에 맞게 반환"""
        event_dict = {
            'id': self.id,
            'title': self.title,
            'start': self.start_date.isoformat(),
            'allDay': self.all_day,
            'backgroundColor': self.category.color if self.category else '#3788d8',
            'borderColor': self.category.color if self.category else '#3788d8',
            'extendedProps': {
                'description': self.description,
                'category_id': self.category_id,
                'category_name': self.category.name if self.category else '',
                'is_system': self.is_system,
                'user_id': self.user_id
            }
        }

        # 종료 날짜가 있으면 추가
        if self.end_date:
            event_dict['end'] = self.end_date.isoformat()

        # 시간이 있으면 추가
        if not self.all_day and self.start_time:
            event_dict['start'] = f"{self.start_date.isoformat()}T{self.start_time.isoformat()}"
            if self.end_time:
                end_date = self.end_date if self.end_date else self.start_date
                event_dict['end'] = f"{end_date.isoformat()}T{self.end_time.isoformat()}"

        return event_dict
