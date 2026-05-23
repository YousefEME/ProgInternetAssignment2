## How to Run

1. Start the backend:
   cd Backend,
   node server.js
   go into .env file and put in your own root password to connect the MySQL.
   If you cannot remember your password plesae use mysql -u root -p

3. Open the frontend:
   Open index.html in browser

4. Ensure MySQL is running with the flashcard_app database
   

Checklist
----------------------------------------------------------------------------------------------------

1. Project:
CardFlash, the Flashcard app ready to use in a flash!

2. Overview:
CardFlash is a flashcard app that lets you create your own flashcards seamlessly, allowing you to cycle through your content for studying, learning a new language or just testing your memory!

3. Technical Stack:
CardFlash was created with HTML, CSS and JavaScript for the frontend, Node.js for the backend, styled with CSS using Flexbox, MySQL for the database, version control with GitHub and GitHub Desktop. 

4. Features:
- Create flashcards with questions and answers by pressing the Add Flashcard Button
- Flip to reveal answer on flashcard
- Cycle to next flashcard by clicking Next button and go to previous flashcard by clicking Previous button
- Current flashcard removed when pressing next button
- Delete flashcards with Delete Button 
- Flashcard counter to count total flashcards 
- Clean and responsive interface

5. Folder Structure:
There are two folders, Frontend and Backend. Frontend contains the HTML, CSS and Javascript files. The backend contains the server.js file, package.json, package-lock.json and node_modules. 

6. Challenges faced:
There were numerous challenges faced when creating this project, the first and most apparent one being synchronising the frontend and backend. Initially the flashcards were simply hardcoded into the html, however I needed to make it dynamic, so by using fetch() in javascript to send requests to node.js which storesand retrieves the flashcards from the MySQL databse. 

I also had trouble making the card disappear after clicking the Next button, as it would be deleted from the database as well. I also needed to make sure the counter was working properly and I wanted the logic to work so that if there is only one flashcard available, pressing the next button would not delete the flashcard. 

