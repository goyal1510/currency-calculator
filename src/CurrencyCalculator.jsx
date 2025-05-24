import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import "./styles/calculator.css";

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

// Flatten the denominations array
const denominations = [1, 2, 5, 10, 20, 50, 100, 200, 500];

const getISTDateTime = () => {
  const now = new Date();
  const options = { 
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };
  // Remove the comma and any extra spaces from the formatted date
  return now.toLocaleString('en-IN', options).replace(/,\s*/g, ' ').trim();
};

export default function CurrencyCalculator() {
  const [counts, setCounts] = useState(Object.fromEntries(denominations.map(d => [d, ''])));
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [dates, setDates] = useState([]);
  const [dateIndex, setDateIndex] = useState(0);
  const [entries, setEntries] = useState([]);
  const [entryIndex, setEntryIndex] = useState(0);
  const [showHistory, setShowHistory] = useState(false);

  const total = Object.entries(counts).reduce((sum, [d, count]) => {
    // Handle empty string or undefined values in total calculation
    const numCount = count === '' ? 0 : parseInt(count || 0);
    return sum + d * numCount;
  }, 0);

  useEffect(() => {
    if (showHistory) {
      fetchDates();
    }
  }, [showHistory]);

  useEffect(() => {
    if (dates.length > 0 && dateIndex >= 0) {
      fetchEntries(dates[dateIndex]);
    } else {
      setEntries([]);
      setEntryIndex(-1);
    }
  }, [dates, dateIndex]);

  useEffect(() => {
    if (entries.length > 0 && entryIndex >= 0 && entries[entryIndex]?.id) {
      fetchEntry(entries[entryIndex].id);
    } else {
      setCounts(Object.fromEntries(denominations.map(d => [d, ''])));
    }
  }, [entryIndex, entries]);

  const fetchDates = async () => {
    try {
      const { data, error } = await supabase
        .from("calculations")
        .select("ist_timestamp")
        .order("created_at", { ascending: false });
      
      if (error) {
        console.error("Error fetching dates:", error);
        return;
      }

      if (!data || data.length === 0) {
        setDates([]);
        setDateIndex(-1);
        return;
      }



      const uniqueDates = [...new Set(data
        .filter(d => d.ist_timestamp) // Filter out null/undefined timestamps
        .map(d => d.ist_timestamp.split(' ')[0]) // Get just the date part
      )];
      
      setDates(uniqueDates);
      setDateIndex(uniqueDates.length > 0 ? 0 : -1);
    } catch (err) {
      console.error("Unexpected error in fetchDates:", err);
    }
  };

  const fetchEntries = async (selectedDate) => {
    if (!selectedDate) return;

    try {

      const { data, error } = await supabase
        .from("calculations")
        .select("id, note, created_at, ist_timestamp")
        .ilike('ist_timestamp', `${selectedDate}%`)
        .order("created_at", { ascending: false });
      
      if (error) {
        console.error("Error fetching entries:", error);
        return;
      }


      if (!data || data.length === 0) {
        setEntries([]);
        setEntryIndex(-1);
        return;
      }
      
      setEntries(data);
      setEntryIndex(0);
    } catch (err) {
      console.error("Unexpected error in fetchEntries:", err);
    }
  };

  const fetchEntry = async (id) => {
    if (!id) return;

    try {
      const { data, error } = await supabase
        .from("denominations")
        .select("denomination, count")
        .eq("calculation_id", id);
      
      if (error) {
        console.error("Error fetching entry:", error);
        return;
      }

      const newCounts = Object.fromEntries(denominations.map(d => [d, '']));
      if (data) {
        data.forEach(({ denomination, count }) => {
          if (denomination in newCounts) {
            newCounts[denomination] = count;
          }
        });
      }
      setCounts(newCounts);
    } catch (err) {
      console.error("Unexpected error in fetchEntry:", err);
    }
  };

  const handleChange = (denomination, value) => {
    // Allow empty string or valid numbers
    const newValue = value === '' ? '' : parseInt(value || 0);
    setCounts({ ...counts, [denomination]: newValue });
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const istDateTime = getISTDateTime();

      const { data: calcData, error: calcError } = await supabase
        .from("calculations")
        .insert([{ 
          note,
          ist_timestamp: istDateTime
        }])
        .select()
        .single();

      if (calcError) {
        console.error("Error saving calculation:", calcError);
        return;
      }

      const entries = denominations
        .filter(d => counts[d] !== '')
        .map(d => ({
          calculation_id: calcData.id,
          denomination: d,
          count: counts[d]
        }));

      const { error: denomError } = await supabase
        .from("denominations")
        .insert(entries);

      if (denomError) {
        console.error("Error saving denominations:", denomError);
        return;
      }

      alert("Calculation saved!");
      setCounts(Object.fromEntries(denominations.map(d => [d, ''])));
      setNote("");
      
      if (showHistory) {
        fetchDates();
      }
    } catch (err) {
      console.error("Unexpected error in handleSave:", err);
    } finally {
      setLoading(false);
    }
  };

  const renderCalculator = () => (
    <div className="calculator-card">
      <div className="header">
        <div className="app-title">Cash Counter</div>
        <button 
          className="history-button"
          onClick={() => setShowHistory(true)}
        >
          History
        </button>
      </div>

      <div className="denominations-container">
        {denominations.map(d => (
          <div key={d} className={`denomination-row ${counts[d] ? 'has-value' : 'empty-value'}`}>
            <label className="denomination-label">₹{d}</label>
            <input
              type="number"
              value={counts[d]}
              min="0"
              onChange={(e) => handleChange(d, e.target.value)}
              className="denomination-input"
              placeholder="0"
            />
            <div className="denomination-total">
              {d * (counts[d] === '' ? 0 : counts[d])}
            </div>
          </div>
        ))}
      </div>

      <div className="bottom-container">
        <div className="note-input-container">
          <input
            placeholder="Add note..."
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 16))}
            maxLength={16}
            className="note-input"
          />
          <span className="note-char-count">{note.length}/16</span>
        </div>
        <div className="total-amount">
          <span className="total-label">Total:</span>
          <span className="total-value">₹{total}</span>
        </div>
        <button
          onClick={handleSave}
          disabled={loading}
          className="save-button"
        >
          {loading ? "..." : "Save"}
        </button>
      </div>
    </div>
  );

  const renderHistory = () => (
    <div className="calculator-card">
      <div className="header">
        <div className="app-title">Cash Counter</div>
        <button 
          className="history-button"
          onClick={() => {
            setShowHistory(false);
            setCounts(Object.fromEntries(denominations.map(d => [d, ''])));
            setNote("");
          }}
        >
          New
        </button>
      </div>

      <div className="history-navigation">
        <div className="date-nav">
          <button
            className="nav-button"
            onClick={() => setDateIndex(Math.min(dateIndex + 1, dates.length - 1))}
            disabled={dateIndex >= dates.length - 1}
          >
            ←
          </button>
          <span className="date-display">
            {dates[dateIndex] || "No Data"}
          </span>
          <button
            className="nav-button"
            onClick={() => setDateIndex(Math.max(dateIndex - 1, 0))}
            disabled={dateIndex <= 0}
          >
            →
          </button>
        </div>

        <div className="entry-nav">
          <button
            className="nav-button"
            onClick={() => setEntryIndex(Math.min(entryIndex + 1, entries.length - 1))}
            disabled={entryIndex >= entries.length - 1}
          >
            ←
          </button>
          <div className="entry-info">
            <div className="entry-time">
              {entries[entryIndex]?.ist_timestamp ? 
                entries[entryIndex].ist_timestamp.split(' ')[1] :
                ""}
            </div>
            <div className="entry-note">
              {entries[entryIndex]?.note || "-"}
            </div>
          </div>
          <button
            className="nav-button"
            onClick={() => setEntryIndex(Math.max(entryIndex - 1, 0))}
            disabled={entryIndex <= 0}
          >
            →
          </button>
        </div>
      </div>

      <div className="denominations-container">
        {denominations.map(d => (
          <div key={d} className={`denomination-row ${counts[d] ? 'has-value' : 'empty-value'}`}>
            <label className="denomination-label">₹{d}</label>
            <div className="denomination-count">{counts[d]}</div>
            <div className="denomination-total">
              {d * (counts[d] === '' ? 0 : counts[d])}
            </div>
          </div>
        ))}
      </div>

      <div className="total-amount history-total">
        <span className="total-label">Total:</span>
        <span className="total-value">₹{total}</span>
      </div>
    </div>
  );

  return (
    <div className="calculator-container">
      <div className="calculator-wrapper">
        {showHistory ? renderHistory() : renderCalculator()}
      </div>
    </div>
  );
}
