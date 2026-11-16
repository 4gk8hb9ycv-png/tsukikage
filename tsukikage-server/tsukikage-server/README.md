# 월영 학원 · 친구 테스트 서버

무료 서버(Render)에 올려서 친구랑 같이 접속해 보는 버전이에요.

## 들어 있는 파일
- `server.js` : 서버 (외부 패키지 없음)
- `package.json` : 서버 설정
- `public/index.html` : 게임 화면

## 올리는 방법
1. **GitHub**(github.com)에 가입하고 오른쪽 위 **+ → New repository**를 눌러요.
   이름은 `tsukikage`처럼 아무거나 쓰고 **Create repository**를 눌러요.
2. 만들어진 저장소 화면에서 **uploading an existing file**을 눌러요.
   압축을 푼 폴더 **안의 파일과 폴더**(`server.js`, `package.json`, `README.md`, `public` 폴더)를 끌어다 놓고 **Commit changes**를 눌러요.
3. **Render**(render.com)에 **GitHub로 로그인**해요.
4. **New + → Web Service** → 방금 만든 저장소를 고르고 아래처럼 채워요.
   - Runtime: **Node**
   - Build Command: 비워 두거나 `npm install`
   - Start Command: `node server.js`
   - Instance Type: **Free**
   - **Environment Variables**에 두 개를 추가해요.
     - `INVITE_CODE` = 입장 코드 (친구한테 알려 줄 코드, 예: `moon77`)
     - `ADMIN_KEY` = 주인 비밀번호 (나만 아는 걸로)
5. **Create Web Service**를 누르고 몇 분 기다리면 `https://이름.onrender.com` 주소가 생겨요.
   이 주소를 친구에게 보내면 돼요.

## 친구가 들어오는 방법
1. 주소를 열고 **신규 등록** → 아이디, 비밀번호, **입장 코드**를 넣어요.
2. 아이디는 서버 전체에서 한 사람만 쓸 수 있어요 (대소문자 구분 없음). 겹치면 다른 아이디를 고르라고 나와요.
3. 다음부터는 **로그인**에 아이디·비밀번호만 넣으면 돼요. 입장 코드는 가입할 때 한 번만 필요해요.

## 주인(맵·디자인 편집)으로 들어가기
`https://이름.onrender.com/?admin=주인비밀번호` 로 한 번 열면 그 브라우저가 주인으로 기억돼요.
설정 ⚙에 맵 그리기 / 디자인 편집 버튼이 보이면 성공이에요.

## 알아 둘 점
- 무료 서버는 15분 동안 아무도 없으면 잠들어요. 다음 사람이 들어올 때 깨어나는 데 1분쯤 걸려요.
- 무료 서버는 다시 켜질 때 저장 파일을 잊어버려요. 그래서 접속했던 사람의 브라우저가 아이디를 자동으로 다시 등록해서 이어 줘요. 다른 사람이 그 사이 같은 아이디를 먼저 가져갈 수 있는 건 테스트 동안만의 약점이에요 (정식 오픈 때 무료 데이터베이스를 붙이면 해결돼요).
- 레벨·캐릭터 같은 게임 저장 데이터는 아직 **각자 브라우저**에 저장돼요. 다른 기기에서 로그인하면 캐릭터를 새로 만들게 돼요.
- 입장 코드를 바꾸고 싶으면 Render의 Environment에서 `INVITE_CODE`만 바꾸면 돼요. 이미 가입한 사람은 그대로 로그인할 수 있어요.
- 동시 접속은 60명까지로 막아 두었어요 (`server.js`의 `MAX_PEERS`).

## 업데이트할 때
새 `public/index.html`을 받으면 GitHub 저장소에서 `public` 폴더 → `index.html` → 연필 아이콘 대신 **Add file → Upload files**로 같은 이름 파일을 다시 올리고 Commit하면, Render가 자동으로 새 버전을 올려요.
