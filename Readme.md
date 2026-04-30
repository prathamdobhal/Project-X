# Manipal Hackathon 2025: Ops CoPilot

**Team Name:** `Team ProjectX`

**Problem Statement:** `AI-Powered Operations Co-Pilot for Mining and Infrastructure`

---

## Introduction

Manufacturing operations generate massive amounts of telemetry, downtime, and maintenance data — often scattered across multiple systems and databases. Managers struggle to extract insights quickly, relying on complex SQL queries and static dashboards. Data that’s rich in potential but silent in practice.

We built Ops CoPilot to give that data a voice.

Ops CoPilot is an AI-powered assistant that turns complex manufacturing data into simple, conversational insights. It connects seamlessly with MySQL, understands natural language, and helps managers make faster, smarter, and data-driven decisions, all through an intuitive chat interface.

Because we believe the future of operations isn’t just automated, it’s understood.
With Ops CoPilot, your factory doesn’t just run.
It speaks.
---

## Access & Live Demo

* **Deployed Website:** [**https://ops-sigma.vercel.app**]
* **Mobile App (APK):** [`android/build/my-app.apk`](android/build/my-app.apk)

---

## Local Deployment Instructions

The deployed link provides a convenient way to view our project. However, for a complete technical review, code verification, and to ensure reproducibility, the following instructions are provided to set up and run the project locally. This allows for a thorough assessment of the project's architecture and build process.

Note: If you are using a seperate OS (other than windows), run the appropriate virtual environment and other terminal commands


## Prerequisites
Python
Node.js


## Without using docker
1. **Clone the repository**
```bash
git clone https://github.com/Manipal-Hackathon-2025/Project-X.git
cd Project-X
```
2. **Setting up Virtual Environment**
```bash
Windows: 
First, delete existing venv folder in src/pages
Run in root or backend:
python -m venv venv
venv\Scripts\Activate.ps1
```

```bash
linux/macOS
python3 -m venv venv
source venv/bin/activate

```

3. **Installations**
```bash
run:
npm install
npm audit fix --force #(if more than 0 vulnerabilities are present)

#running the requirements file
cd backend
pip install -r requirements.txt
```

4. **.env file**
```bash
Create a .env file in root
Paste the following:
ASYNC_DATABASE_URL=mysql+aiomysql://root:Aditya%402356@127.0.0.1:3306/oee
DATABASE_URL=mysql+pymysql://root:Aditya%402356@127.0.0.1:3306/oee
YOUR_API_KEY = AIzaSyA2WqiFfMFU8GJfMD9gDDZjTfcMwdTrdo8
VITE_FIREBASE_API_KEY=AIzaSyCSmUXlmZeMsgA3sEr-CI6QUcVGutHW-8s
VITE_FIREBASE_AUTH_DOMAIN=http://project-x-61704.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=project-x-61704
VITE_FIREBASE_STORAGE_BUCKET=http://project-x-61704.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=898081993703
VITE_FIREBASE_APP_ID=1:898081993703:web:e73c5c3526fc4441af0342
# optional
VITE_FIREBASE_MEASUREMENT_ID=G-04FVGQNYX
```


5. **Running app.py**
```bash
#During this step, if you can't interact with your terminal afterwards, redo the above steps.
#Better way would be to just run using the run button on the top right (if available)

go to src/pages/app.py
keep this running in the background
```
6. **Launching the app**
```bash
run:
npm run dev

app: http://localhost:5173/
backend: http://127.0.0.1:8000/docs
```


### Using Docker 

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/Manipal-Hackathon-2025/your-team-repo.git](https://github.com/Manipal-Hackathon-2025/Project-X.git)
    cd Project-X
    ```

2.  **Build the Docker image:**
    ```bash
    docker build -t ops-copilot .
    ```

3.  **Run the Docker container:**
    ```bash
    docker run -it --rm -p 3000:3000 opscopilot
    ```

4.  **Access the application:**
    Navigate to [http://localhost:5173](http://localhost:5173) in your web browser.

5. **Run the /src/pages/app.py file simaltaneously with the website.**





## Features

Here are the key functionalities of our project:

#### Web Application

* **Chat-based Query Interface:** Natural language queries to fetch insights from the uploaded data.
* **Multi-Database Integration:** Our app uses MySQL which supports multiple databases, you can upload more than one and seamlessly switch between them.
* **Chart & Table Visualization:** Auto-generated bar, line, and pie charts from AI outputs.
* **Explainability:** Each result includes how the graph/chart was computed.
* **Token Management:** Uses Python libraries to generate precise, data-driven graphs instead of AI-rendered images, saving tokens and improving visualization accuracy.
---
#### Data Columns in uploaded Sample CSV

| **Column**                | **Description**                                       |
|---------------------------|-------------------------------------------------------|
| **Status**                | ACTIVE / INACTIVE (states observed in the sample).    |
| **Date (dd/mm/yy)**       | Calendar date for the record.                         |
| **Start Time**            | Start timestamp (local).                              |
| **End Time**              | End timestamp (local).                                |
| **Duration (HH:MM:SS)**   | Computed interval length.                             |
| **Alert**                 | Yes/No flag indicating alert-triggered events.        |
| **Reason**                | Categorical reason label provided by operator.        |
| **Issue**                 | Sub-reason or issue text (free/controlled).           |
| **Comment**               | Optional notes by operator.                           |

---

## Tech Stack

* **Frontend:** `Angular, Flutter`
* **Backend:** `FastAPI(Python)`
* **Database:** `MySQL, Firebase`
* **LLM Integration:** `OpenAI API`
* **Visualiation:** `MySQL, Firebase`
* **Deployment:** `Docker, Vercel`