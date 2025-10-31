#!/usr/bin/env python3
"""
DB 마이그레이션: pet_status 테이블 생성
공부 펫 시스템을 위한 사용자별 펫 상태 관리 테이블
"""

import sys
import os

# 프로젝트 루트를 Python 경로에 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app
from models import db
from models.pet import PetStatus

def create_pet_status_table():
    """pet_status 테이블 생성"""
    with app.app_context():
        try:
            # 테이블이 이미 존재하는지 확인
            inspector = db.inspect(db.engine)
            if 'pet_status' in inspector.get_table_names():
                print("⚠️  'pet_status' 테이블이 이미 존재합니다.")
                response = input("테이블을 삭제하고 다시 생성하시겠습니까? (yes/no): ")
                if response.lower() != 'yes':
                    print("마이그레이션이 취소되었습니다.")
                    return

                # 테이블 삭제
                PetStatus.__table__.drop(db.engine)
                print("✓ 기존 'pet_status' 테이블이 삭제되었습니다.")

            # 테이블 생성
            PetStatus.__table__.create(db.engine)
            print("✓ 'pet_status' 테이블이 성공적으로 생성되었습니다.")

            # 테이블 구조 출력
            print("\n생성된 테이블 구조:")
            print("=" * 60)
            for column in PetStatus.__table__.columns:
                print(f"  - {column.name}: {column.type} (nullable={column.nullable})")
            print("=" * 60)

            print("\n✅ 마이그레이션이 완료되었습니다!")
            print("\n📝 다음 단계:")
            print("  1. 애플리케이션을 재시작하세요")
            print("  2. 사용자가 공부 분석 페이지에 접속하면 자동으로 펫이 생성됩니다")
            print("  3. /api/pet/status 엔드포인트로 펫 상태를 확인할 수 있습니다")

        except Exception as e:
            print(f"❌ 오류 발생: {e}")
            import traceback
            traceback.print_exc()

if __name__ == '__main__':
    print("=" * 60)
    print("펫 시스템 데이터베이스 마이그레이션")
    print("=" * 60)
    print()

    create_pet_status_table()
