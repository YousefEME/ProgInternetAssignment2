let currentFlashcardIndex = 0; //keeps track of current flashcard
let usedCardIds = new Set(); // stores cards ids so they dont reappear after pressing next

// function to flip the card from the question to reveal the answer 
function flipCard(card) {
    const question = card.querySelector('.content:not(.hidden)');
    const answer = card.querySelector('.content.hidden');

    // first click shows the answer, second click deletes the card and moves to the next card
    if (question) {
        question.classList.add('hidden');
        answer.classList.remove('hidden');
    } else {
        card.remove();

        const cards = document.querySelectorAll('.flashcard');
        // if no cards left, update counter and return
        if (cards.length > 0) {
            currentFlashcardIndex = 0;
            cards[0].classList.add('active');
        }

        updateCounter(cards.length);
    }
}
// shows flashcard based on the index
function showFlashcard(index) {
    const flashcards = document.querySelectorAll('.flashcard');
    flashcards.forEach((card, i) => {
        card.classList.remove('active');
        if (i === index) {
            card.classList.add('active');
        }
    });
}
// moves to next flashcard then deletes the card when the next button is pressed
function nextFlashcard() {
    const cards = document.querySelectorAll('.flashcard');

    // if there is only one card left, do not delete it and just return
    if (cards.length <= 1) return;

    // remove active class from current card
    const currentCard = cards[currentFlashcardIndex];
    const id = currentCard.dataset.id;

    // mark as used
    usedCardIds.add(Number(id));

    currentCard.remove();

    const remainingCards = document.querySelectorAll('.flashcard');
    // if no cards left, update counter and return
    if (remainingCards.length === 0) {
        updateCounter(0);
        return;
    }

    // move to the next card after deletion
    currentFlashcardIndex = currentFlashcardIndex % remainingCards.length;
    remainingCards[currentFlashcardIndex].classList.add('active');

    updateCounter(remainingCards.length);
}

// when previous button is pressed, move to the previous flashcard without deleting the card
function prevFlashcard() {
    const cards = document.querySelectorAll('.flashcard');
    if (cards.length === 0) return;

    // remove active class from current card
    cards[currentFlashcardIndex].classList.remove('active');
    // move to the previous card
    currentFlashcardIndex = (currentFlashcardIndex - 1 + cards.length) % cards.length;
    // add active class to the new current card
    cards[currentFlashcardIndex].classList.add('active');
}

// function to add flashcard to the database and then reload the flashcards to show the new card
function addFlashcard() {
    const questionInput = document.getElementById('new-question');
    const answerInput = document.getElementById('new-answer');

    const question = questionInput.value.trim();
    const answer = answerInput.value.trim();

    // if no question or answer is entered, alert the user and return
    if (!question || !answer) {
        alert("Please enter both a question and an answer.");
        return;
    }

    // Send POST request to add the new flashcard
    fetch('http://localhost:3000/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, answer })
    })
    .then(() => {
        loadCards(); // Reload the flashcards
        questionInput.value = ''; // Clear the input fields
        answerInput.value = '';
    })
    .catch(err => console.error("Error adding flashcard:", err));
}
// function to delete flashcard from the database and then reload the flashcards to show the updated list of cards
function deleteFlashcard() {
    const cards = document.querySelectorAll('.flashcard');
    const currentCard = cards[currentFlashcardIndex];
    if (!currentCard) return;
    const id = currentCard.dataset.id;

    // Send DELETE request to remove the flashcard
    fetch(`http://localhost:3000/cards/${id}`, {
        method: 'DELETE'
    }).then(() => loadCards()); // Reload the flashcards after deletion
}


// function to load flashcards from the backend MySQL database and display them on the page, also filters out used cards so they dont reappear after pressing next
function loadCards() {
    fetch('http://localhost:3000/cards')
        .then(res => res.json())
        .then(data => {
            const container = document.getElementById('container');
            container.innerHTML = "";
            // Remove cards that were already used in this session

            const filtered = data.filter(card => !usedCardIds.has(card.id));

            filtered.forEach((card, index) => {
                const div = document.createElement('div');
                div.className = 'flashcard';
                div.dataset.id = card.id;

                // make the first card active by default
                if (index === 0) div.classList.add('active');
                div.onclick = () => flipCard(div);

                div.innerHTML = `
                    <div class="content">${card.question}</div>
                    <div class="content hidden">${card.answer}</div>
                `;

                container.appendChild(div);
            });
            // reset index to 0 after loading new cards
            currentFlashcardIndex = 0;
            updateCounter(filtered.length);
        });
}
// update the total number of cards by counting the number of flashcards currently displayed on the page and updating the counter element with the new count
function updateCounter(count) {
    document.getElementById('counter').textContent =
        "Total cards: " + count;
}
// initial load of flashcards when the page is loaded
loadCards();
