"""
일정 모델
"""
from . import db

class Schedule(db.Model):
    __tablename__ = 'schedules'

    entry_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(10), db.ForeignKey('users.id'), nullable=False)
    date = db.Column(db.String(10), nullable=False)
    time = db.Column(db.String(5), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    location = db.Column(db.String(100))
