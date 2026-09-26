# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
npx sv@0.16.1 create --template minimal --types ts --add tailwindcss="plugins:none" --install npm ./
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## ประกาศกลาง

จัดการประกาศในโปรเจกต์ ../Announcements ด้วยสิทธิ์ admin หรือ superadmin ใช้ PocketBase เดียวกัน เลือกปลายทาง all หรือ printer เพื่อแสดงในเว็บนี้ ผู้เข้าชมเห็นป๊อปอัปโดยไม่ต้องล็อกอิน และเห็นใหม่ทุกครั้งที่เปิดหรือรีโหลดเว็บ ปิดแล้วไม่เด้งซ้ำในการเปิดครั้งนั้น ยกเว้นมีประกาศใหม่หรือแก้ไข ตรวจเมื่อเปิดหน้า ทุก 30 วินาทีเมื่อแท็บมองเห็น และเมื่อกลับมาเปิดแท็บ เปิดอ่านซ้ำได้จากปุ่ม “ประกาศ”

/api/announcements ส่งเฉพาะประกาศ published ที่อยู่ในช่วงเวลาและเลือกเว็บนี้ ข้อความเป็น plain text ลิงก์เฉพาะ HTTP/HTTPS ไม่มี localStorage สำหรับการรับทราบ หากยังไม่มี collection หรือโหลดครั้งแรกไม่ได้ จะใช้ประกาศน้ำท่วมสำรองใน src/lib/flood-announcement.ts (enabled: false ปิดสำรองได้) ถ้าเคยโหลดสำเร็จจะใช้ผลรอบล่าสุดระหว่างการเชื่อมต่อขัดข้อง