# 🎓 KUSIS - Korea University Sejong Integrated Service

고려대학교 세종캠퍼스 통합 서비스 플랫폼

<div align="center">

![Python](https://img.shields.io/badge/Python-3.8+-3776AB?style=flat&logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-2.2.2-000000?style=flat&logo=flask&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=flat&logo=postgresql&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=flat&logo=javascript&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-green.svg)

</div>

---

## 📋 목차

- [프로젝트 소개](#-프로젝트-소개)
- [주요 기능](#-주요-기능)
- [기술 스택](#-기술-스택)
- [프로젝트 구조](#-프로젝트-구조)
- [설치 및 실행](#-설치-및-실행)
- [환경 변수 설정](#-환경-변수-설정)
- [API 엔드포인트](#-api-엔드포인트)
- [데이터베이스 스키마](#-데이터베이스-스키마)
- [스크린샷](#-스크린샷)
- [기여 방법](#-기여-방법)
- [라이센스](#-라이센스)

---

## 🎯 프로젝트 소개

**KUSIS**는 고려대학교 세종캠퍼스 학생들을 위한 종합 학사 관리 및 캠퍼스 생활 정보 플랫폼입니다.
시간표 관리, 학사 일정, 식당 메뉴, 셔틀버스 시간표 등 캠퍼스 생활에 필요한 모든 정보를 한 곳에서 확인할 수 있습니다.

### 🌟 핵심 가치

- **편의성**: 흩어진 정보를 한 곳에서 통합 관리
- **실시간성**: 식당 메뉴 자동 크롤링 및 실시간 업데이트
- **학습 관리**: 시간표, GPA, 학습 시간 추적 등 체계적인 학사 관리
- **데이터 인사이트**: 학습 패턴 분석 및 성취도 시각화 (구현 예정)
- **소셜 연결**: 친구와의 시간표 공유 및 협업 (구현 예정)
- **커뮤니티**: 게시판을 통한 학생 간 정보 공유

---

## 🚀 주요 기능

### 1️⃣ 사용자 인증 및 권한 관리
- 회원가입/로그인 시스템
- 3단계 권한 시스템 (일반 사용자, 게시글 관리자, 관리자)
- 안전한 비밀번호 해싱 (Werkzeug Security)

### 2️⃣ 학사 관리 시스템
#### 📅 시간표 관리
- 학기별 시간표 자동 생성
- 과목 추가/수정/삭제
- 시간대별 시각적 타임테이블
- 과목별 메모 기능

#### 📊 학업 성취도 추적
- GPA 자동 계산 및 통계
- 학기별 성적 추이 분석
- 목표 학점 설정 및 관리
- 학습 시간 기록 및 통계

#### 📆 학사 일정
- 학사 일정 캘린더
- D-day 계산 및 알림
- 카테고리별 일정 분류

### 3️⃣ 개인 캘린더 🚧 구현 예정
#### 📅 통합 캘린더 뷰
- 월간/주간/일간 캘린더 뷰
- 시간표, 학사 일정, 개인 일정 통합 표시
- 색상 코드를 통한 일정 구분
- 드래그 앤 드롭으로 일정 이동

#### 📝 개인 일정 관리
- 개인 일정 추가/수정/삭제
- 일정 카테고리 설정 (학업, 과제, 시험, 개인 등)
- 반복 일정 설정 (매일, 매주, 매월)
- 일정 알림 설정

#### 🔔 스마트 알림
- 일정 시작 전 알림
- 과제 마감일 D-day 알림
- 시험 일정 자동 알림
- 커스터마이징 가능한 알림 설정

### 4️⃣ 학습 분석 및 통계 🚧 구현 예정
#### 📊 학습 패턴 분석
- 과목별 학습 시간 시각화 (차트/그래프)
- 일별/주별/월별 학습 통계
- 학습 집중도 분석 (시간대별 효율성)
- 학습 목표 대비 달성률 추적

#### 🎯 성취도 리포트
- 학기별 성적 추이 그래프
- 과목별 성적 비교 분석
- 학점 예측 시뮬레이션
- 개인 맞춤 학습 인사이트 제공

#### 🏆 학습 동기부여
- 학습 스트릭 (연속 학습 일수)
- 배지 및 성취 시스템
- 학습 목표 설정 및 달성 현황
- 학기별 학습 성과 요약

### 5️⃣ 친구 및 소셜 기능 🚧 구현 예정
#### 👥 친구 관리
- 학번으로 친구 추가/삭제
- 친구 목록 관리
- 친구 프로필 조회 (공개 설정 범위 내)
- 친구 요청 승인/거부 시스템

#### 📚 친구 시간표 공유
- 친구 시간표 열람 (공개 설정 시)
- 공강 시간 매칭 (함께 시간이 비는 시간대 찾기)
- 같은 수업 듣는 친구 확인
- 스터디 그룹 시간 조율

#### 🤝 협업 기능
- 친구와 학습 그룹 생성
- 그룹 스터디 일정 공유
- 과제 협업 기능
- 학습 자료 공유

#### 📈 친구 비교 (선택적)
- 친구와 학습 시간 비교 (동의 시)
- 학습 동기부여를 위한 랭킹
- 개인정보 보호 중심 설계

### 6️⃣ 게시판 시스템
- 게시물 CRUD (작성, 조회, 수정, 삭제)
- 이미지 첨부 기능 (최대 3개)
- 카테고리별 분류 (공지, 홍보, 안내, 업데이트, 일반)
- 관리자 승인 시스템
- 공지사항 상단 고정
- 게시물 노출 기한 설정
- 실시간 미리보기

### 7️⃣ 캠퍼스 생활 정보
#### 🍽️ 식당 메뉴
- 학생식당/교직원식당 주간 메뉴
- 실시간 웹 크롤링 (고려대학교 세종캠퍼스 공식 사이트)
- 식사 종류별 분류 (조식, 중식-한식/일품/분식/plus, 석식)
- 오늘의 메뉴 하이라이트

#### 🚌 셔틀버스 시간표
- 노선별 시간표 조회
- 현재 시각 기준 다음 버스 안내

### 8️⃣ Todo 관리
- Todo 추가/수정/삭제
- 완료 상태 토글
- 우선순위 설정

### 9️⃣ 관리자 기능
- 사용자 권한 관리
- 게시물 승인/거부
- 게시물 가시성 제어
- 사용자 계정 관리

---

## 🛠 기술 스택

### Backend
- **Framework**: Flask 2.2.2
- **Database**: PostgreSQL
- **ORM**: SQLAlchemy (Flask-SQLAlchemy 3.0.3)
- **Authentication**: Werkzeug Security
- **Task Scheduler**: APScheduler 3.10.4
- **Web Scraping**: BeautifulSoup4 4.12.3

### Frontend
- **HTML5** / **CSS3** / **JavaScript (ES6+)**
- **Responsive Design**: Mobile-friendly UI
- **Icons**: Font Awesome

### DevOps & Deployment
- **WSGI Server**: Gunicorn 20.1.0
- **Environment Management**: python-dotenv
- **Version Control**: Git

### External Libraries
- **requests**: HTTP 요청
- **lxml**: XML/HTML 파싱
- **pytz**: 시간대 관리

---

## 📁 프로젝트 구조

```
Korea-University-Sejong-Intergrated-Service-KUSIS/
│
├── app.py                      # 메인 애플리케이션 파일
├── crawling.py                 # 식당 메뉴 크롤링 스크립트
├── requirements.txt            # Python 의존성 패키지
│
├── models/                     # 데이터베이스 모델
│   ├── __init__.py            # SQLAlchemy 초기화 및 모델 export
│   ├── user.py                # 사용자 모델
│   ├── semester.py            # 학기 모델
│   ├── subject.py             # 과목 모델
│   ├── schedule.py            # 학사 일정 모델
│   ├── study.py               # 학습 로그 모델
│   ├── todo.py                # Todo 모델
│   └── post.py                # 게시물 모델
│
├── services/                   # 비즈니스 로직 서비스
│   ├── __init__.py
│   ├── semester_service.py    # 학기 관리 서비스
│   ├── meal_service.py        # 식단 정보 서비스
│   └── bus_service.py         # 버스 시간표 서비스
│
├── utils/                      # 유틸리티 함수 및 상수
│   ├── __init__.py
│   ├── constants.py           # 전역 상수 정의
│   ├── decorators.py          # 인증/권한 데코레이터
│   └── helpers.py             # 헬퍼 함수
│
├── templates/                  # Jinja2 템플릿
│   ├── base.html              # 기본 레이아웃
│   ├── index.html             # 메인 대시보드
│   ├── login.html             # 로그인 페이지
│   ├── register.html          # 회원가입 페이지
│   ├── admin.html             # 관리자 페이지
│   ├── timetable_management.html  # 시간표 관리
│   ├── post_management.html   # 게시판 목록
│   ├── create_post.html       # 게시물 작성
│   ├── edit_post.html         # 게시물 수정
│   ├── view_post.html         # 게시물 상세
│   └── fragments/             # 템플릿 조각
│       ├── _header.html       # 헤더
│       └── _sidebar_left.html # 사이드바
│
├── static/                     # 정적 파일
│   ├── css/                   # 스타일시트
│   ├── js/                    # JavaScript 파일
│   │   ├── script.js          # 메인 스크립트
│   │   ├── timetable_management.js
│   │   ├── post_management.js
│   │   ├── create_post.js
│   │   ├── edit_post.js
│   │   ├── admin.js
│   │   └── register.js
│   ├── images/                # 이미지 파일
│   └── uploads/               # 업로드된 파일
│
├── menu_data/                  # 크롤링된 식단 데이터
│   ├── student_menu.json      # 학생식당 메뉴
│   └── staff_menu.json        # 교직원식당 메뉴
│
└── schedules/                  # 학사 일정 데이터
    └── schedule_data.json     # 학사 일정 JSON
```

---

## 🔧 설치 및 실행

### 사전 요구사항
- Python 3.8 이상
- PostgreSQL 12 이상
- pip (Python 패키지 관리자)

### 1. 저장소 클론
```bash
git clone https://github.com/SeonGyuJang/Korea-University-Sejong-Intergrated-Service-KUSIS.git
cd Korea-University-Sejong-Intergrated-Service-KUSIS
```

### 2. 가상 환경 생성 및 활성화
```bash
# 가상 환경 생성
python -m venv venv

# 활성화 (Windows)
venv\Scripts\activate

# 활성화 (Mac/Linux)
source venv/bin/activate
```

### 3. 의존성 패키지 설치
```bash
pip install -r requirements.txt
```

### 4. 환경 변수 설정
프로젝트 루트에 `.env` 파일을 생성하고 다음 내용을 입력합니다:

```env
# Flask Configuration
FLASK_SECRET_KEY=your-secret-key-here

# Database Configuration
DB_USER=your_db_username
DB_PASSWORD=your_db_password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=kusis_db
```

### 5. 데이터베이스 초기화
```bash
# PostgreSQL에서 데이터베이스 생성
createdb kusis_db

# Flask 데이터베이스 초기화
flask init-db
```

### 6. 식당 메뉴 크롤링 (선택사항)
```bash
python crawling.py
```

### 7. 애플리케이션 실행
```bash
# 개발 서버 실행
flask run

# 또는 Gunicorn으로 프로덕션 실행
gunicorn -w 4 -b 0.0.0.0:8000 app:app
```

애플리케이션이 `http://localhost:5000` 또는 `http://localhost:8000`에서 실행됩니다.

---

## 🔐 환경 변수 설정

### 필수 환경 변수

| 변수명 | 설명 | 예시 |
|--------|------|------|
| `FLASK_SECRET_KEY` | Flask 세션 암호화 키 | `your-random-secret-key-here` |
| `DB_USER` | PostgreSQL 사용자명 | `postgres` |
| `DB_PASSWORD` | PostgreSQL 비밀번호 | `your_password` |
| `DB_HOST` | 데이터베이스 호스트 | `localhost` |
| `DB_PORT` | 데이터베이스 포트 | `5432` |
| `DB_NAME` | 데이터베이스 이름 | `kusis_db` |

### 보안 주의사항
- `.env` 파일은 절대 버전 관리에 포함하지 마세요!
- `FLASK_SECRET_KEY`는 충분히 복잡한 랜덤 문자열을 사용하세요.
- 프로덕션 환경에서는 강력한 데이터베이스 비밀번호를 사용하세요.

---

## 📡 API 엔드포인트

### 인증
- `POST /login` - 사용자 로그인
- `POST /register` - 회원가입
- `GET /logout` - 로그아웃

### 학사 관리
- `GET /api/semesters` - 학기 목록 조회
- `GET /api/timetable-data` - 시간표 데이터 조회
- `POST /api/subjects` - 과목 추가
- `PUT /api/subjects/:id` - 과목 수정
- `DELETE /api/subjects/:id` - 과목 삭제
- `GET /api/subjects/:id/memo/:date` - 과목별 메모 조회
- `PUT /api/subjects/:id/memo/:date` - 과목별 메모 저장
- `GET /api/gpa-stats` - GPA 통계 조회
- `GET /api/study-stats` - 학습 통계 조회
- `POST /api/study-time` - 학습 시간 기록
- `POST /api/credits/goal` - 목표 학점 설정

### 학사 일정
- `GET /api/schedule` - 학사 일정 조회
- `POST /api/schedule/add` - 학사 일정 추가

### 게시판
- `GET /post_management` - 게시물 목록
- `GET /post/:id` - 게시물 상세
- `POST /post/create` - 게시물 작성
- `POST /post/:id/edit` - 게시물 수정
- `POST /post/:id/delete` - 게시물 삭제
- `POST /post/:id/approve` - 게시물 승인 (관리자)
- `POST /post/:id/toggle_visibility` - 게시물 가시성 제어 (관리자)

### 캠퍼스 정보
- `GET /api/meal` - 오늘의 식단 조회
- `GET /api/meal/week` - 주간 식단 조회
- `GET /api/shuttle` - 셔틀버스 시간표 조회
- `GET /api/notifications` - 공지사항 조회

### Todo
- `GET /api/todos` - Todo 목록 조회
- `POST /api/todos` - Todo 추가
- `PUT /api/todos/:id` - Todo 수정
- `DELETE /api/todos/:id` - Todo 삭제

### 관리자
- `GET /admin` - 관리자 페이지
- `POST /admin/users/:id/permission` - 사용자 권한 변경
- `DELETE /admin/users/:id` - 사용자 삭제

---

## 🗄 데이터베이스 스키마

### Users (사용자)
- `id` (PK): 학번 (문자열)
- `password_hash`: 해시된 비밀번호
- `name`: 이름
- `major`: 전공
- `is_admin`: 관리자 여부
- `can_post`: 게시글 작성 권한
- `created_at`: 생성일시

### Semesters (학기)
- `id` (PK): 학기 ID
- `user_id` (FK): 사용자 ID
- `year`: 연도
- `semester_type`: 학기 구분 (1학기, 여름학기, 2학기, 겨울학기)
- `start_date`: 시작일
- `end_date`: 종료일
- `target_credits`: 목표 학점

### Subjects (과목)
- `id` (PK): 과목 ID
- `semester_id` (FK): 학기 ID
- `name`: 과목명
- `professor`: 담당교수
- `credits`: 학점
- `grade`: 성적
- `color`: 시간표 색상
- `building`: 강의동
- `room`: 강의실

### TimeSlots (시간 슬롯)
- `id` (PK): 슬롯 ID
- `subject_id` (FK): 과목 ID
- `day_of_week`: 요일 (0-6)
- `start_time`: 시작 시간
- `end_time`: 종료 시간

### Schedules (학사 일정)
- `id` (PK): 일정 ID
- `event_name`: 일정명
- `category`: 카테고리
- `start_date`: 시작일
- `end_date`: 종료일
- `priority`: 우선순위

### StudyLogs (학습 로그)
- `id` (PK): 로그 ID
- `subject_id` (FK): 과목 ID
- `study_date`: 학습일
- `duration_minutes`: 학습 시간(분)

### Todos
- `id` (PK): Todo ID
- `user_id` (FK): 사용자 ID
- `content`: 내용
- `is_completed`: 완료 여부
- `priority`: 우선순위
- `created_at`: 생성일시

### Posts (게시물)
- `id` (PK): 게시물 ID
- `author_id` (FK): 작성자 ID
- `title`: 제목
- `content`: 내용
- `category`: 카테고리
- `is_notice`: 공지사항 여부
- `is_approved`: 승인 여부
- `is_visible`: 가시성
- `image_filenames`: 첨부 이미지 파일명 (쉼표 구분)
- `expires_at`: 노출 종료일시
- `created_at`: 작성일시
- `updated_at`: 수정일시

---

## 📸 스크린샷

### 메인 대시보드
메인 페이지에서는 학사 일정, 오늘의 식단, 셔틀버스 시간표, 공지사항을 한눈에 확인할 수 있습니다.

### 시간표 관리
학기별 시간표를 시각적으로 관리하고, 과목별 메모를 작성할 수 있습니다.

### 게시판
카테고리별로 분류된 게시판에서 정보를 공유하고, 이미지를 첨부할 수 있습니다.

### 관리자 페이지
사용자 권한 관리, 게시물 승인 등의 관리 기능을 제공합니다.

---

## 🤝 기여 방법

프로젝트에 기여하고 싶으신가요? 환영합니다! 다음 단계를 따라주세요:

1. **Fork** 이 저장소
2. 새로운 **브랜치** 생성 (`git checkout -b feature/amazing-feature`)
3. 변경사항 **커밋** (`git commit -m 'Add some amazing feature'`)
4. 브랜치에 **푸시** (`git push origin feature/amazing-feature`)
5. **Pull Request** 생성

### 코드 스타일 가이드
- Python: PEP 8 스타일 가이드 준수
- JavaScript: ESLint 권장 설정
- 의미 있는 커밋 메시지 작성
- 새로운 기능에는 문서화 추가

### 버그 리포트
버그를 발견하셨나요? 이슈를 생성할 때 다음 정보를 포함해주세요:
- 버그 설명
- 재현 방법
- 예상 동작
- 실제 동작
- 스크린샷 (해당하는 경우)
- 환경 정보 (OS, 브라우저, Python 버전 등)

---

## 📄 라이센스

이 프로젝트는 MIT 라이센스 하에 배포됩니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.

---

## 👥 개발자

**Seon Gyu Jang**
- GitHub: [@SeonGyuJang](https://github.com/SeonGyuJang)
- Email: dsng3419@korea.ac.kr

---

## 🙏 감사의 말

- 고려대학교 세종캠퍼스
- Flask 및 SQLAlchemy 커뮤니티
- 모든 오픈소스 기여자들

---

## 📚 추가 문서

- [사용자 가이드](docs/USER_GUIDE.md) (예정)
- [개발자 가이드](docs/DEVELOPER_GUIDE.md) (예정)
- [API 문서](docs/API_DOCUMENTATION.md) (예정)
- [배포 가이드](docs/DEPLOYMENT_GUIDE.md) (예정)

---

<div align="center">

**Made with ❤️ for Korea University Sejong Campus**

[⬆ 맨 위로](#-kusis---korea-university-sejong-integrated-service)

</div>
