const express = require('express');
const sqlite3 = require('sqlite3');
const bodyParser = require('body-parser');

const app = express();
const port = 3000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static('public'));


const db = new sqlite3.Database(':memory:');

db.serialize(() => {
    db.run("CREATE TABLE Przedmioty (id INTEGER PRIMARY KEY, nazwa TEXT, lokalizacja TEXT, czy_sprawny BOOLEAN)");
    db.run("CREATE TABLE Rezerwacje (id INTEGER PRIMARY KEY, przedmiot_id INTEGER, imie TEXT, nazwisko TEXT, data DATE, godzina_od TIME, godzina_do TIME)");

    const przedmioty = [
        { nazwa: 'Stół pingpongowy', lokalizacja: 'korytarz G-1', czy_sprawny: false },
        { nazwa: 'Stół w korytarzu A-2', lokalizacja: 'korytarz A-2', czy_sprawny: true },
        { nazwa: 'Projektor Instytut Fizyki', lokalizacja: 'sekretariat Instytutu Fizyki', czy_sprawny: true }
    ];

    const stmt = db.prepare("INSERT INTO Przedmioty (nazwa, lokalizacja, czy_sprawny) VALUES (?, ?, ?)");
    przedmioty.forEach(przedmiot => {
        stmt.run(przedmiot.nazwa, przedmiot.lokalizacja, przedmiot.czy_sprawny);
    });
    stmt.finalize();
});

app.get('/', (req, res) => {
    db.all("SELECT * FROM Przedmioty", (err, przedmioty) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Wystąpił błąd podczas pobierania danych.');
        }
        let listaPrzedmiotowHTML = '<ul>';
        przedmioty.forEach(przedmiot => {
            listaPrzedmiotowHTML += `<li><a href="/przedmiot/${przedmiot.id}">${przedmiot.nazwa}</a></li>`;
        });
        listaPrzedmiotowHTML += '</ul>';
        res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Strona Rezerwacji</title>
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    <div class="container">
        <h1>Witaj na stronie rezerwacji!</h1>
        <h2>Dostępne przedmioty:</h2>
        ${listaPrzedmiotowHTML}
        <a href="/rezerwuj">Zarezerwuj przedmiot</a>
    </div>
</body>
</html>
`);
    });
});

app.get('/rezerwuj', (req, res) => {
    db.all("SELECT * FROM Przedmioty WHERE czy_sprawny = 1", (err, przedmioty) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Wystąpił błąd podczas pobierania danych.');
        }
        let opcjePrzedmiotowHTML = przedmioty.map(przedmiot => `<option value="${przedmiot.id}">${przedmiot.nazwa}</option>`).join('');
        res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Formularz Rezerwacji</title>
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    <div class="container">
        <h1>Formularz rezerwacji</h1>
        <form action="/rezerwuj" method="post">
            <label for="przedmiot_id">Wybierz przedmiot:</label>
            <select name="przedmiot_id" id="przedmiot_id" required>
                ${opcjePrzedmiotowHTML}
            </select>
            <br>
            <label>Imię:</label>
            <input type="text" name="imie" required>
            <br>
            <label>Nazwisko:</label>
            <input type="text" name="nazwisko" required>
            <br>
            <label>Data rezerwacji:</label>
            <input type="date" name="data" required>
            <br>
            <label>Godzina od:</label>
            <input type="time" name="godzina_od" required>
            <br>
            <label>Godzina do:</label>
            <input type="time" name="godzina_do" required>
            <br>
            <button type="submit">Zarezerwuj</button>
        </form>
        <br><br>
        <a href="/">Powrót do strony głównej</a>
    </div>
</body>
</html>
        `);
    });
});

app.post('/rezerwuj', (req, res) => {

    const { przedmiot_id, imie, nazwisko, data, godzina_od, godzina_do } = req.body;

    const sprawdzenieQuery = `
        SELECT * FROM Rezerwacje
        WHERE przedmiot_id = ?
        AND data = ?
        AND (
            (godzina_od < ? AND godzina_do > ?)
            OR (godzina_od < ? AND godzina_do > ?)
            OR (godzina_od >= ? AND godzina_do <= ?)
        )
    `;

    db.get(sprawdzenieQuery, [przedmiot_id, data, godzina_do, godzina_do, godzina_od, godzina_od, godzina_od, godzina_do], (err, row) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Wystąpił błąd podczas sprawdzania dostępności przedmiotu.');
        }
        if (row) {
            return res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Rezerwacja Niedostępna</title>
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    <div class="container">
        <h2>Przepraszamy, przedmiot jest już zarezerwowany w tym przedziale czasowym.</h2>
        <br><br>
        <a href="/rezerwuj">Powrót do formularza rezerwacji</a>
        <br>
        <a href="/">Powrót do strony głównej</a>
    </div>
</body>
</html>
            `);
        } else {
            const insertQuery = "INSERT INTO Rezerwacje (przedmiot_id, imie, nazwisko, data, godzina_od, godzina_do) VALUES (?, ?, ?, ?, ?, ?)";
            db.run(insertQuery, [przedmiot_id, imie, nazwisko, data, godzina_od, godzina_do], (err) => {
                if (err) {
                    console.error(err.message);
                    return res.status(500).send('Wystąpił błąd podczas dokonywania rezerwacji.');
                }
                res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Rezerwacja Zakończona Sukcesem</title>
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    <div class="container">
        <h2>Dziękujemy, ${imie}! Twój przedmiot został zarezerwowany.</h2>
        <br><br>
        <a href="/">Powrót do strony głównej</a>
    </div>
</body>
</html>
                `);
            });
        }
    });
});


app.get('/przedmiot/:id', (req, res) => {
    const id = req.params.id;
    db.get("SELECT * FROM Przedmioty WHERE id = ?", [id], (err, przedmiot) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Wystąpił błąd podczas pobierania danych.');
        }
        if (!przedmiot) {
            return res.status(404).send('Przedmiot nie został znaleziony.');
        }
        // let akcjaRezerwacji;
        // if (przedmiot.czy_sprawny) {
        //     akcjaRezerwacji = `<a href="/rezerwuj/${przedmiot.id}">Zarezerwuj</a>`;
        // } else {
        //     akcjaRezerwacji = `<span title="Przedmiot niesprawny - nie można zarezerwować">Zarezerwuj (niedostępne)</span>`;
        // }
        res.send(`
<!DOCTYPE html>
    <html>
        <head>
            <title>Strona Rezerwacji</title>
            <link rel="stylesheet" href="/css/style.css">
        </head>
        <body>
            <div class="container">
                <h1>${przedmiot.nazwa}</h1>
                <p>Lokalizacja: ${przedmiot.lokalizacja}</p>
                <p>Czy sprawny: ${przedmiot.czy_sprawny ? 'Tak' : 'Nie'}</p>
                <a href="/rezerwuj/${przedmiot.id}">Zarezerwuj</a>
                <br><br>
                <a href="/">Powrót do strony głównej</a>
            </div>
        </body>
    </html>  
    `);
    });
});

app.get('/rezerwuj/:id', (req, res) => {
    const id = req.params.id;
    db.get("SELECT czy_sprawny FROM Przedmioty WHERE id = ?", [id], (err, przedmiot) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Wystąpił błąd podczas sprawdzania stanu przedmiotu.');
        }
        if (!przedmiot.czy_sprawny) {
            return res.send(`
<!DOCTYPE html>
    <html>
        <head>
            <title>Strona Rezerwacji</title>
            <link rel="stylesheet" href="/css/style.css">
        </head>
        <body>
            <div class="container">
                <p>Przepraszamy, wybrany przedmiot jest niesprawny i nie może być zarezerwowany.</p>
                <br><br>
                <a href="/">Powrót do strony głównej</a>
            </div>
        </body>
    </html>`);
        } else {
            res.send(`
<!DOCTYPE html>
    <html>
        <head>
            <title>Strona Rezerwacji</title>
            <link rel="stylesheet" href="/css/style.css">
        </head>
        <body>
            <div class="container">
                <h1>Formularz rezerwacji</h1>
                <form action="/rezerwuj/${id}" method="post">
                    <label>Imię:</label>
                    <input type="text" name="imie" required>
                    <br>
                    <label>Nazwisko:</label>
                    <input type="text" name="nazwisko" required>
                    <br>
                    <label>Data rezerwacji:</label>
                    <input type="date" name="data" required>
                    <br>
                    <label>Godzina od:</label>
                    <input type="time" name="godzina_od" required>
                    <br>
                    <label>Godzina do:</label>
                    <input type="time" name="godzina_do" required>
                    <br>
                    <button type="submit">Zarezerwuj</button>
                </form>
                <br><br>
                <a href="/">Powrót do strony głównej</a>
            </div>
        </body>
    </html>`);
        }
    });
});


app.post('/rezerwuj/:id', (req, res) => {
    const przedmiotId = req.params.id;
    const { imie, nazwisko, data, godzina_od, godzina_do } = req.body;

    const sprawdzenieQuery = `
        SELECT * FROM Rezerwacje
        WHERE przedmiot_id = ?
        AND data = ?
        AND (
            (godzina_od < ? AND godzina_do > ?)
            OR (godzina_od < ? AND godzina_do > ?)
            OR (godzina_od >= ? AND godzina_do <= ?)
        )
    `;

    db.get(sprawdzenieQuery, [przedmiotId, data, godzina_do, godzina_do, godzina_od, godzina_od, godzina_od, godzina_do], (err, row) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Wystąpił błąd podczas sprawdzania dostępności przedmiotu.');
        }
        if (row) {
            return res.status(400).send(`<!DOCTYPE html>
<html>
<head>
    <title>Rezerwacja Niedostępna</title>
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    <div class="container">
        <h2>Przepraszamy, przedmiot jest już zarezerwowany w tym przedziale czasowym.</h2>
        <br><br>
        <a href="/rezerwuj">Powrót do formularza rezerwacji</a>
        <br>
        <a href="/">Powrót do strony głównej</a>
    </div>
</body>
</html>`);
        } else {
            db.run("INSERT INTO Rezerwacje (przedmiot_id, imie, nazwisko, data, godzina_od, godzina_do) VALUES (?, ?, ?, ?, ?, ?)",
                [przedmiotId, imie, nazwisko, data, godzina_od, godzina_do], (err) => {
                    if (err) {
                        console.error(err.message);
                        return res.status(500).send('Wystąpił błąd podczas rezerwacji.');
                    }
                    res.send(`
<!DOCTYPE html>
    <html>
        <head>
            <title>Strona Rezerwacji</title>
            <link rel="stylesheet" href="/css/style.css">
        </head>
        <body>
            <div class="container">
                <h2>Dziękujemy, ${imie}! Twój przedmiot został zarezerwowany.</h2>
                <br><br>
                <a href="/">Powrót do strony głównej</a>
             </div>
        </body>
    </html>  
`);
                });
        }
    });
});

app.get('/pokaz-rezerwacje', (req, res) => {
    db.all("SELECT * FROM Rezerwacje", (err, rezerwacje) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send('Wystąpił błąd podczas pobierania danych o rezerwacjach.');
        }
        let rezerwacjeHTML = '<ul>';
        rezerwacje.forEach(rezerwacja => {
            rezerwacjeHTML += `<li>ID: ${rezerwacja.id}, Przedmiot ID: ${rezerwacja.przedmiot_id}, Imię: ${rezerwacja.imie}, Nazwisko: ${rezerwacja.nazwisko}, Data: ${rezerwacja.data}, Godzina od: ${rezerwacja.godzina_od}, Godzina do: ${rezerwacja.godzina_do}</li>`;
        });
        rezerwacjeHTML += '</ul>';
        res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Lista Rezerwacji</title>
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    <div class="container">
        <h1>Lista Rezerwacji</h1>
        ${rezerwacjeHTML}
        <br><br>
        <a href="/">Powrót do strony głównej</a>
    </div>
</body>
</html>
        `);
    });
});


// Uruchomienie serwera
app.listen(port, () => {
    console.log(`Serwer działa na http://localhost:${port}`);
    console.log(`Rezerwacje można zobaczyć na http://localhost:${port}/pokaz-rezerwacje`);
});
