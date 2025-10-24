"""
학기 모델
"""
from . import db

class Semester(db.Model):
    __tablename__ = 'semesters'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(10), db.ForeignKey('users.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    year = db.Column(db.Integer, nullable=False)
    season = db.Column(db.String(50), nullable=False)
    start_date = db.Column(db.Date)

    subjects = db.relationship('Subject', backref='semester', lazy=True, cascade="all, delete-orphan")
    todos = db.relationship('Todo', backref='semester', lazy=True, cascade="all, delete-orphan")

    __table_args__ = (db.UniqueConstraint('user_id', 'name', name='_user_semester_name_uc'),)
