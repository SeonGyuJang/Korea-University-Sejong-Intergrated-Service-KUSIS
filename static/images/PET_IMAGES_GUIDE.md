# 펫 이미지 가이드

공부 펫 시스템을 위한 이미지를 준비해주세요.

## 필요한 이미지 파일

각 펫 종류별로 레벨 1-10까지의 이미지가 필요합니다:

### 고양이 (Cat)
- `pet_cat_lv1.png` - 레벨 1 고양이
- `pet_cat_lv2.png` - 레벨 2 고양이
- `pet_cat_lv3.png` - 레벨 3 고양이
- `pet_cat_lv4.png` - 레벨 4 고양이
- `pet_cat_lv5.png` - 레벨 5 고양이
- `pet_cat_lv6.png` - 레벨 6 고양이
- `pet_cat_lv7.png` - 레벨 7 고양이
- `pet_cat_lv8.png` - 레벨 8 고양이
- `pet_cat_lv9.png` - 레벨 9 고양이
- `pet_cat_lv10.png` - 레벨 10 고양이 (최대 레벨)

### 강아지 (Dog)
- `pet_dog_lv1.png` ~ `pet_dog_lv10.png`

### 토끼 (Rabbit)
- `pet_rabbit_lv1.png` ~ `pet_rabbit_lv10.png`

### 새 (Bird)
- `pet_bird_lv1.png` ~ `pet_bird_lv10.png`

## 이미지 사양

- **크기**: 200x200px (정사각형)
- **포맷**: PNG (투명 배경 권장)
- **용량**: 각 100KB 이하
- **스타일**: 귀여운 캐릭터 스타일 (픽셀 아트, 일러스트 등)

## 레벨별 성장 컨셉

- **Lv 1-2**: 아기 (작고 귀여운 모습)
- **Lv 3-4**: 어린이 (조금 성장한 모습)
- **Lv 5-6**: 청소년 (활발한 모습)
- **Lv 7-8**: 성인 (멋진 모습)
- **Lv 9-10**: 전설 (특별한 효과나 장식 추가)

## 임시 플레이스홀더

이미지가 준비되지 않은 경우, 다음 방법으로 임시로 대체할 수 있습니다:

1. 무료 아이콘 사이트에서 다운로드:
   - https://www.flaticon.com/ (고양이, 강아지 등 검색)
   - https://icons8.com/
   - https://www.iconfinder.com/

2. AI 이미지 생성기 사용:
   - https://www.midjourney.com/
   - https://www.bing.com/create (Bing Image Creator)
   - https://www.canva.com/ (Canva AI)

3. 픽셀 아트 생성기:
   - https://www.pixilart.com/

## 플레이스홀더 생성 스크립트

이미지가 없는 경우를 위한 임시 플레이스홀더는 JavaScript에서 자동으로 fallback을 처리합니다.
`default_avatar.png`가 대체 이미지로 사용됩니다.
