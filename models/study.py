"""
학습 로그 모델
"""
from . import db

class StudyLog(db.Model):
    __tablename__ = 'study_logs'

    entry_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(10), db.ForeignKey('users.id'), nullable=False, index=True)
    subject_id = db.Column(db.Integer, db.ForeignKey('subjects.id'), nullable=True, index=True) # [수정] nullable=True
    date = db.Column(db.Date, nullable=False, index=True) # [수정] String -> Date 타입으로 변경
    duration_seconds = db.Column(db.Integer, nullable=False) # [수정] default=0 제거 (매번 새 로그이므로)

    subject = db.relationship('Subject') # [신규] Subject 모델과 관계 설정

    # [수정] UniqueConstraint 제거 (하루에 여러 과목/개인 공부 기록 가능)
    # __table_args__ = (db.UniqueConstraint('user_id', 'date', name='_user_date_uc'),)