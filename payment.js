(function () {
    "use strict";

    var USER_KEY = "skillConnectCurrentUser";      // already used by your project
    var COURSE_KEY = "skillConnectCheckoutCourse"; // set by the Buy Course button
    var ENROLL_KEY = "skillConnectEnrollments";    // already read by your dashboard
    var PAY_KEY = "skillConnectPayments";          // new: payment history

    function readJSON(storage, key, fallback) {
        try {
            var v = JSON.parse(storage.getItem(key));
            return v === null || v === undefined ? fallback : v;
        } catch (e) { return fallback; }
    }
    function $(id) { return document.getElementById(id); }
    function rupees(n) { return "₹" + Number(n).toLocaleString("en-IN"); }

    // ---- Guards ----
    var user = readJSON(sessionStorage, USER_KEY, null);
    if (!user) { window.location.replace("index.html"); return; }

    var course = readJSON(sessionStorage, COURSE_KEY, null);
    if (!course || !course.title || !Number.isFinite(Number(course.price))) {
        window.location.replace("dashboard.html");
        return;
    }
    course.price = Number(course.price);

    var enrollments = readJSON(localStorage, ENROLL_KEY, {});
    if ((enrollments[user.email] || []).indexOf(course.id) !== -1) {
        window.location.replace("dashboard.html#myCourses");
        return;
    }

    // ---- Order summary ----
    $("courseName").textContent = course.title;
    $("courseCategory").textContent = course.category || "";
    $("courseIcon").textContent = course.icon || "📚";
    $("coursePrice").textContent = rupees(course.price);
    $("totalPrice").textContent = rupees(course.price);
    $("payButton").textContent = "Pay " + rupees(course.price);

    // ---- Method tabs ----
    var currentMethod = "UPI";
    document.querySelectorAll('input[name="method"]').forEach(function (radio) {
        radio.addEventListener("change", function () {
            currentMethod = radio.value;
            document.querySelectorAll(".method").forEach(function (label) {
                label.classList.toggle("active", label.contains(radio));
            });
            document.querySelectorAll(".panel").forEach(function (panel) {
                panel.hidden = panel.dataset.panel !== currentMethod;
            });
            clearErrors();
        });
    });

    // ---- Input formatting ----
    $("cardNumber").addEventListener("input", function (e) {
        var d = e.target.value.replace(/\D/g, "").slice(0, 16);
        e.target.value = d.replace(/(.{4})/g, "$1 ").trim();
    });
    $("cardExpiry").addEventListener("input", function (e) {
        var d = e.target.value.replace(/\D/g, "").slice(0, 4);
        e.target.value = d.length > 2 ? d.slice(0, 2) + "/" + d.slice(2) : d;
    });
    $("cardCvv").addEventListener("input", function (e) {
        e.target.value = e.target.value.replace(/\D/g, "").slice(0, 3);
    });

    // ---- Validation ----
    function luhn(num) {
        var sum = 0, alt = false;
        for (var i = num.length - 1; i >= 0; i--) {
            var d = Number(num[i]);
            if (alt) { d *= 2; if (d > 9) d -= 9; }
            sum += d; alt = !alt;
        }
        return sum % 10 === 0;
    }
    function clearErrors() {
        $("formError").textContent = "";
        document.querySelectorAll(".invalid").forEach(function (el) { el.classList.remove("invalid"); });
    }
    function fail(id, text) {
        $(id).classList.add("invalid");
        $(id).focus();
        $("formError").textContent = text;
        return null;
    }
    function validate() {
        clearErrors();

        if (currentMethod === "UPI") {
            var upi = $("upiId").value.trim().toLowerCase();
            if (!/^[a-z0-9._-]{2,}@[a-z]{2,}$/.test(upi)) return fail("upiId", "Enter a valid UPI ID like name@upi.");
            return { label: "UPI (" + upi + ")", shouldFail: upi.indexOf("fail") === 0 };
        }

        if (currentMethod === "Card") {
            var name = $("cardName").value.trim();
            var num = $("cardNumber").value.replace(/\s/g, "");
            var exp = $("cardExpiry").value;
            var cvv = $("cardCvv").value;

            if (name.length < 2) return fail("cardName", "Enter the name on the card.");
            if (num.length !== 16 || !luhn(num)) return fail("cardNumber", "Enter a valid 16-digit card number.");
            var m = /^(\d{2})\/(\d{2})$/.exec(exp);
            if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) return fail("cardExpiry", "Enter expiry as MM/YY.");
            if (new Date(2000 + Number(m[2]), Number(m[1]), 1) <= new Date()) return fail("cardExpiry", "This card has expired.");
            if (cvv.length !== 3) return fail("cardCvv", "Enter the 3-digit CVV.");

            // Only the last 4 digits are kept. Full card data is never stored.
            return { label: "Card •••• " + num.slice(-4), shouldFail: num === "4000000000000002" };
        }

        var bank = $("bank");
        if (!bank.value) return fail("bank", "Please select a bank.");
        return { label: "Net Banking (" + bank.options[bank.selectedIndex].text + ")", shouldFail: bank.value === "FAIL" };
    }

    // ---- Fake payment ----
    function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function newId(prefix) {
        return prefix + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
    }

    var paying = false;

    $("payForm").addEventListener("submit", async function (event) {
        event.preventDefault();
        if (paying) return;

        var details = validate();
        if (!details) return;

        paying = true;
        $("payButton").disabled = true;
        $("overlay").hidden = false;

        $("overlayText").textContent = "Contacting your bank…";
        await wait(1000);
        $("overlayText").textContent = "Verifying payment…";
        await wait(1000);

        var payment = {
            paymentId: newId("PAY"),
            orderId: newId("ORD"),
            email: user.email,
            courseId: course.id,
            courseName: course.title,
            amount: course.price,
            method: details.label,
            status: details.shouldFail ? "failed" : "success",
            date: new Date().toISOString()
        };

        var history = readJSON(localStorage, PAY_KEY, []);
        if (!Array.isArray(history)) history = [];
        history.push(payment);
        localStorage.setItem(PAY_KEY, JSON.stringify(history));

        if (payment.status === "success") {
            var all = readJSON(localStorage, ENROLL_KEY, {});
            var list = all[user.email] || [];
            if (list.indexOf(course.id) === -1) list.push(course.id);
            all[user.email] = list;
            localStorage.setItem(ENROLL_KEY, JSON.stringify(all));
            sessionStorage.removeItem(COURSE_KEY);
        }

        $("overlay").hidden = true;
        showPopup(payment);
        paying = false;
    });

    // ---- Result popup ----
    function addRow(dl, label, value) {
        var row = document.createElement("div");
        var dt = document.createElement("dt");
        var dd = document.createElement("dd");
        dt.textContent = label;
        dd.textContent = value;
        row.append(dt, dd);
        dl.appendChild(row);
    }

    function showPopup(payment) {
        var ok = payment.status === "success";

        $("popupIcon").className = "result-icon " + (ok ? "ok" : "bad");
        $("popupIcon").textContent = ok ? "✓" : "✕";
        $("popupTitle").textContent = ok ? "Payment Successful!" : "Payment Failed";
        $("popupText").textContent = ok
            ? "You are now enrolled in " + payment.courseName + ". (Demo payment, no money was charged.)"
            : "The demo payment was declined. You have not been charged.";

        var receipt = $("receipt");
        receipt.replaceChildren();
        addRow(receipt, "Payment ID", payment.paymentId);
        addRow(receipt, "Course", payment.courseName);
        addRow(receipt, "Amount", rupees(payment.amount));
        addRow(receipt, "Method", payment.method);
        addRow(receipt, "Date", new Date(payment.date).toLocaleString("en-IN"));

        var actions = $("popupActions");
        actions.replaceChildren();

        if (ok) {
            var go = document.createElement("a");
            go.href = "dashboard.html#myCourses";
            go.textContent = "Go to My Courses";
            actions.appendChild(go);
        } else {
            var retry = document.createElement("button");
            retry.type = "button";
            retry.textContent = "Try again";
            retry.addEventListener("click", function () {
                $("popup").hidden = true;
                $("payButton").disabled = false;
            });
            var back = document.createElement("a");
            back.href = "dashboard.html";
            back.className = "secondary";
            back.textContent = "Back to courses";
            actions.append(retry, back);
        }

        $("popup").hidden = false;
    }
})();
