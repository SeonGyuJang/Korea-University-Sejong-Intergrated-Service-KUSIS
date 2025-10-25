-- ================================================
-- calendar_events 테이블 스키마 수정 SQL
-- ================================================
-- 이 파일은 calendar_events 테이블에 누락된 description 컬럼을 추가합니다.
--
-- 실행 방법:
-- psql -h <DB_HOST> -p <DB_PORT> -U <DB_USER> -d <DB_NAME> -f fix_calendar_schema.sql
--
-- 또는 pgAdmin이나 다른 PostgreSQL 클라이언트에서 직접 실행하세요.
-- ================================================

-- 1. 현재 테이블 구조 확인
\echo '=== 현재 calendar_events 테이블 구조 ==='
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'calendar_events'
ORDER BY ordinal_position;

-- 2. description 컬럼이 이미 존재하는지 확인
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'calendar_events'
        AND column_name = 'description'
    ) THEN
        RAISE NOTICE 'description 컬럼이 이미 존재합니다.';
    ELSE
        RAISE NOTICE 'description 컬럼이 존재하지 않습니다. 추가합니다...';

        -- description 컬럼 추가
        ALTER TABLE calendar_events ADD COLUMN description TEXT;

        RAISE NOTICE 'description 컬럼이 성공적으로 추가되었습니다!';
    END IF;
END $$;

-- 3. 반복 일정 관련 컬럼 확인 및 추가
DO $$
BEGIN
    -- recurrence_type 컬럼 확인
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'calendar_events'
        AND column_name = 'recurrence_type'
    ) THEN
        ALTER TABLE calendar_events ADD COLUMN recurrence_type VARCHAR(20);
        RAISE NOTICE 'recurrence_type 컬럼 추가됨';
    END IF;

    -- recurrence_end_date 컬럼 확인
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'calendar_events'
        AND column_name = 'recurrence_end_date'
    ) THEN
        ALTER TABLE calendar_events ADD COLUMN recurrence_end_date DATE;
        RAISE NOTICE 'recurrence_end_date 컬럼 추가됨';
    END IF;

    -- recurrence_interval 컬럼 확인
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'calendar_events'
        AND column_name = 'recurrence_interval'
    ) THEN
        ALTER TABLE calendar_events ADD COLUMN recurrence_interval INTEGER DEFAULT 1;
        RAISE NOTICE 'recurrence_interval 컬럼 추가됨';
    END IF;
END $$;

-- 4. 최종 테이블 구조 확인
\echo ''
\echo '=== 최종 calendar_events 테이블 구조 ==='
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'calendar_events'
ORDER BY ordinal_position;

\echo ''
\echo '=== 완료! ==='
\echo '앱 서버를 재시작하세요: python app.py'
