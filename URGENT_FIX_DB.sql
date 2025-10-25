-- ================================================
-- 긴급 DB 수정: description 컬럼 강제 추가
-- ================================================
-- 이 파일을 반드시 실행하세요!
--
-- pgAdmin이나 다른 PostgreSQL 클라이언트에서:
-- 1. 이 파일 열기
-- 2. 전체 선택 (Ctrl+A)
-- 3. 실행 (F5 또는 실행 버튼)
-- ================================================

-- Step 1: 현재 상태 확인
\echo '========================================='
\echo 'Step 1: 현재 테이블 구조 확인'
\echo '========================================='

SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'calendar_events'
ORDER BY ordinal_position;

-- Step 2: description 컬럼 추가 (이미 있으면 무시)
\echo ''
\echo '========================================='
\echo 'Step 2: description 컬럼 추가'
\echo '========================================='

DO $$
BEGIN
    -- description 컬럼이 없으면 추가
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'calendar_events'
        AND column_name = 'description'
    ) THEN
        ALTER TABLE calendar_events ADD COLUMN description TEXT;
        RAISE NOTICE '✅ description 컬럼이 추가되었습니다!';
    ELSE
        RAISE NOTICE 'ℹ️  description 컬럼이 이미 존재합니다.';
    END IF;

    -- recurrence_type 컬럼이 없으면 추가
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'calendar_events'
        AND column_name = 'recurrence_type'
    ) THEN
        ALTER TABLE calendar_events ADD COLUMN recurrence_type VARCHAR(20);
        RAISE NOTICE '✅ recurrence_type 컬럼이 추가되었습니다!';
    ELSE
        RAISE NOTICE 'ℹ️  recurrence_type 컬럼이 이미 존재합니다.';
    END IF;

    -- recurrence_end_date 컬럼이 없으면 추가
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'calendar_events'
        AND column_name = 'recurrence_end_date'
    ) THEN
        ALTER TABLE calendar_events ADD COLUMN recurrence_end_date DATE;
        RAISE NOTICE '✅ recurrence_end_date 컬럼이 추가되었습니다!';
    ELSE
        RAISE NOTICE 'ℹ️  recurrence_end_date 컬럼이 이미 존재합니다.';
    END IF;

    -- recurrence_interval 컬럼이 없으면 추가
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'calendar_events'
        AND column_name = 'recurrence_interval'
    ) THEN
        ALTER TABLE calendar_events ADD COLUMN recurrence_interval INTEGER DEFAULT 1;
        RAISE NOTICE '✅ recurrence_interval 컬럼이 추가되었습니다!';
    ELSE
        RAISE NOTICE 'ℹ️  recurrence_interval 컬럼이 이미 존재합니다.';
    END IF;
END $$;

-- Step 3: 최종 확인
\echo ''
\echo '========================================='
\echo 'Step 3: 최종 테이블 구조 확인'
\echo '========================================='

SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'calendar_events'
ORDER BY ordinal_position;

\echo ''
\echo '========================================='
\echo '✅ 완료!'
\echo '========================================='
\echo '이제 앱 서버를 재시작하세요:'
\echo '  1. Ctrl+C로 앱 종료'
\echo '  2. python app.py로 재시작'
\echo '  3. 브라우저 새로고침 (Ctrl+Shift+R)'
\echo '========================================='
