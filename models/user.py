"""
사용자 모델
"""
from . import db
from utils.constants import DEFAULT_TOTAL_CREDITS

class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.String(10), primary_key=True)
    name = db.Column(db.String(50), nullable=False)
    dob = db.Column(db.String(10), nullable=False)
    college = db.Column(db.String(100), nullable=False)
    department = db.Column(db.String(100), nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    permission = db.Column(db.String(20), default='general', nullable=False)
    total_credits_goal = db.Column(db.Integer, default=DEFAULT_TOTAL_CREDITS, nullable=False)

    semesters = db.relationship('Semester', backref='user', lazy=True, cascade="all, delete-orphan")
    subjects = db.relationship('Subject', backref='user', lazy=True, cascade="all, delete-orphan")
    schedules = db.relationship('Schedule', backref='user', lazy=True, cascade="all, delete-orphan")
    study_logs = db.relationship('StudyLog', backref='user', lazy=True, cascade="all, delete-orphan")
    todos = db.relationship('Todo', backref='user', lazy=True, cascade="all, delete-orphan")
    posts = db.relationship('Post', backref='author', lazy=True, cascade="all, delete-orphan")

    # --- [신규] 커뮤니티 관계 추가 ---
    comments = db.relationship('Comment', back_populates='author', lazy=True, cascade="all, delete-orphan")
    likes = db.relationship('PostLike', back_populates='user', lazy=True, cascade="all, delete-orphan")
    # --- [신규] 추가 끝 ---

    @property
    def is_admin(self):
        return self.permission == 'admin'

    @property
    def is_associate(self):
        return self.permission == 'associate'

    @property
    def can_manage_posts(self):
        return self.is_admin or self.is_associate