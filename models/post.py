"""
게시물 모델
"""
from datetime import datetime
from . import db

class Post(db.Model):
    __tablename__ = 'posts'

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, nullable=False)
    author_id = db.Column(db.String(10), db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    is_approved = db.Column(db.Boolean, default=False, nullable=False)
    is_notice = db.Column(db.Boolean, default=False, nullable=False)
    image_filenames = db.Column(db.Text, nullable=True)
    category = db.Column(db.String(50), nullable=True, default='일반')
    expires_at = db.Column(db.DateTime, nullable=True)
    is_visible = db.Column(db.Boolean, default=True, nullable=False)

    def to_dict(self, include_content=False):
        image_list = self.image_filenames.split(',') if self.image_filenames else []
        data = {
            'id': self.id,
            'title': self.title,
            'author_name': self.author.name if self.author else 'Unknown',
            'created_at': self.created_at.isoformat(),
            'is_approved': self.is_approved,
            'is_notice': self.is_notice,
            'image_filenames': image_list,
            'category': self.category,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'is_visible': self.is_visible
        }
        if include_content:
            data['content'] = self.content
            data['author_id'] = self.author_id
        return data
