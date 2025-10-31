"""
공부 펫 시스템 모델
사용자의 공부 동기부여를 위한 가상 펫 관리
"""
from . import db
from datetime import datetime, date

class PetStatus(db.Model):
    __tablename__ = 'pet_status'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(10), db.ForeignKey('users.id'), nullable=False, unique=True, index=True)

    # 펫 기본 정보
    pet_type = db.Column(db.String(20), nullable=False, default='cat')  # cat, dog, rabbit, bird
    pet_name = db.Column(db.String(50), nullable=False, default='공부친구')

    # 펫 성장 정보
    level = db.Column(db.Integer, nullable=False, default=1)
    experience = db.Column(db.Integer, nullable=False, default=0)

    # 펫 건강 상태
    health = db.Column(db.Integer, nullable=False, default=100)  # 0-100
    mood = db.Column(db.String(20), nullable=False, default='happy')  # happy, normal, sad, critical

    # 공부 추적
    last_study_date = db.Column(db.Date, nullable=True)
    consecutive_study_days = db.Column(db.Integer, nullable=False, default=0)
    total_study_time = db.Column(db.Integer, nullable=False, default=0)  # 총 공부 시간 (초)

    # 배지 및 업적
    badges = db.Column(db.JSON, nullable=False, default=list)  # ['first_week', 'month_master', ...]

    # 타임스탬프
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def calculate_health(self):
        """
        마지막 공부 날짜 기준으로 건강도 계산
        """
        if not self.last_study_date:
            return 50  # 처음 시작

        today = date.today()
        days_since_study = (today - self.last_study_date).days

        if days_since_study == 0:
            return 100  # 오늘 공부함
        elif days_since_study == 1:
            return 90
        elif days_since_study == 2:
            return 70
        elif days_since_study == 3:
            return 50
        elif days_since_study == 4:
            return 35
        elif days_since_study == 5:
            return 20
        elif days_since_study == 6:
            return 10
        else:  # 7일 이상
            return 5

    def calculate_mood(self, health):
        """
        건강도 기준으로 감정 상태 계산
        """
        if health >= 80:
            return 'happy'
        elif health >= 50:
            return 'normal'
        elif health >= 20:
            return 'sad'
        else:
            return 'critical'

    def update_status(self):
        """
        건강도와 감정 상태 업데이트
        """
        self.health = self.calculate_health()
        self.mood = self.calculate_mood(self.health)

    def add_experience(self, study_seconds):
        """
        공부 시간에 따라 경험치 추가 (1시간 = 100 exp)
        """
        exp_gain = int(study_seconds / 36)  # 1시간 = 3600초 = 100 exp
        self.experience += exp_gain

        # 레벨업 체크
        while self.experience >= self.level * 1000 and self.level < 10:
            self.experience -= self.level * 1000
            self.level += 1

        return exp_gain

    def get_level_progress(self):
        """
        현재 레벨 진행도 (퍼센트)
        """
        if self.level >= 10:
            return 100
        required_exp = self.level * 1000
        return int((self.experience / required_exp) * 100) if required_exp > 0 else 0

    def get_mood_message(self):
        """
        감정 상태별 메시지
        """
        messages = {
            'happy': '기분이 너무 좋아요! 오늘도 함께 공부해요! 🌟',
            'normal': '괜찮아요. 함께 조금만 더 공부해볼까요? 📚',
            'sad': '많이 외로워요... 조금만 시간을 내주세요 😢',
            'critical': '너무 힘들어요... 곧 사라질 것 같아요... 💔'
        }
        return messages.get(self.mood, '...')

    def check_and_award_badges(self):
        """
        조건 달성 시 배지 수여
        """
        new_badges = []

        # 연속 공부 배지
        if self.consecutive_study_days >= 7 and 'week_warrior' not in self.badges:
            new_badges.append('week_warrior')
            self.badges.append('week_warrior')

        if self.consecutive_study_days >= 30 and 'month_master' not in self.badges:
            new_badges.append('month_master')
            self.badges.append('month_master')

        if self.consecutive_study_days >= 100 and 'century_champion' not in self.badges:
            new_badges.append('century_champion')
            self.badges.append('century_champion')

        # 레벨 배지
        if self.level >= 5 and 'level_5_hero' not in self.badges:
            new_badges.append('level_5_hero')
            self.badges.append('level_5_hero')

        if self.level >= 10 and 'max_level_legend' not in self.badges:
            new_badges.append('max_level_legend')
            self.badges.append('max_level_legend')

        # 총 공부 시간 배지 (100시간)
        if self.total_study_time >= 360000 and 'hundred_hours' not in self.badges:
            new_badges.append('hundred_hours')
            self.badges.append('hundred_hours')

        return new_badges

    def to_dict(self):
        """
        JSON 직렬화
        """
        return {
            'id': self.id,
            'user_id': self.user_id,
            'pet_type': self.pet_type,
            'pet_name': self.pet_name,
            'level': self.level,
            'experience': self.experience,
            'level_progress': self.get_level_progress(),
            'health': self.health,
            'mood': self.mood,
            'mood_message': self.get_mood_message(),
            'last_study_date': self.last_study_date.isoformat() if self.last_study_date else None,
            'consecutive_study_days': self.consecutive_study_days,
            'total_study_time': self.total_study_time,
            'badges': self.badges,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }
