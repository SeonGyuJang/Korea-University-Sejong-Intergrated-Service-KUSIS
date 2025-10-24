"""
과목 및 시간표 모델
"""
from . import db

class Subject(db.Model):
    __tablename__ = 'subjects'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(10), db.ForeignKey('users.id'), nullable=False)
    semester_id = db.Column(db.Integer, db.ForeignKey('semesters.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    professor = db.Column(db.String(50))
    credits = db.Column(db.Integer, default=3, nullable=False)
    grade = db.Column(db.String(10), default='Not Set')
    memo = db.Column(db.Text, default='{"note": "", "todos": []}')

    timeslots = db.relationship('TimeSlot', backref='subject', lazy=True, cascade="all, delete-orphan")

class TimeSlot(db.Model):
    __tablename__ = 'timeslots'

    id = db.Column(db.Integer, primary_key=True)
    subject_id = db.Column(db.Integer, db.ForeignKey('subjects.id'), nullable=False)
    day_of_week = db.Column(db.Integer, nullable=False)
    start_time = db.Column(db.String(5), nullable=False)
    end_time = db.Column(db.String(5), nullable=False)
    room = db.Column(db.String(50))
