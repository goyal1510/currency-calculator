import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { FiEdit2 } from "react-icons/fi";
import { RiDeleteBin6Line } from "react-icons/ri";
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
  const [counts, setCounts] = useState(Object.fromEntries(denominations.map(d => [d, { bundle: '', open: '', total: 0 }])));
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [dates, setDates] = useState([]);
  const [dateIndex, setDateIndex] = useState(0);
  const [entries, setEntries] = useState([]);
  const [entryIndex, setEntryIndex] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [dialog, setDialog] = useState({ show: false, message: '', type: '' });

  const total = Object.entries(counts).reduce((sum, [d, count]) => {
    return sum + d * count.total;
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
      setCounts(Object.fromEntries(denominations.map(d => [d, { bundle: '', open: '', total: 0 }])));
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
        .select("denomination, count, bundle_count, open_count")
        .eq("calculation_id", id);
      
      if (error) {
        console.error("Error fetching entry:", error);
        return;
      }

      const newCounts = Object.fromEntries(
        denominations.map(d => [d, { bundle: '', open: '', total: 0 }])
      );

      if (data) {
        data.forEach(({ denomination, count, bundle_count, open_count }) => {
          if (denomination in newCounts) {
            newCounts[denomination] = {
              bundle: bundle_count || '',
              open: open_count || '',
              total: count || 0
            };
          }
        });
      }
      setCounts(newCounts);
    } catch (err) {
      console.error("Unexpected error in fetchEntry:", err);
    }
  };

  const handleChange = (denomination, type, value) => {
    const newValue = value === '' ? '' : parseInt(value || 0);
    setCounts(prev => {
      const prevCount = prev[denomination];
      const bundle = type === 'bundle' ? newValue : prevCount.bundle;
      const open = type === 'open' ? newValue : prevCount.open;
      const bundleValue = bundle === '' ? 0 : bundle * 100;
      const openValue = open === '' ? 0 : open;
      
      return {
        ...prev,
        [denomination]: {
          bundle: type === 'bundle' ? value : prevCount.bundle,
          open: type === 'open' ? value : prevCount.open,
          total: bundleValue + openValue
        }
      };
    });
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const istDateTime = getISTDateTime();

      if (editingEntryId) {
        // Update existing entry without changing timestamp
        const { error: calcError } = await supabase
          .from("calculations")
          .update({ note })
          .eq('id', editingEntryId);

        if (calcError) {
          console.error("Error updating calculation:", calcError);
          return;
        }

        // Delete existing denominations
        const { error: deleteError } = await supabase
          .from("denominations")
          .delete()
          .eq('calculation_id', editingEntryId);

        if (deleteError) {
          console.error("Error deleting old denominations:", deleteError);
          return;
        }

        // Insert new denominations
        const entries = denominations
          .filter(d => counts[d].total > 0)
          .map(d => ({
            calculation_id: editingEntryId,
            denomination: d,
            count: counts[d].total,
            bundle_count: counts[d].bundle === '' ? 0 : counts[d].bundle,
            open_count: counts[d].open === '' ? 0 : counts[d].open
          }));

        const { error: denomError } = await supabase
          .from("denominations")
          .insert(entries);

        if (denomError) {
          console.error("Error updating denominations:", denomError);
          return;
        }

        setDialog({
          show: true,
          message: "Entry updated successfully!",
          type: 'success'
        });
      } else {
        // Create new entry with current timestamp
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
          .filter(d => counts[d].total > 0)
          .map(d => ({
            calculation_id: calcData.id,
            denomination: d,
            count: counts[d].total,
            bundle_count: counts[d].bundle === '' ? 0 : counts[d].bundle,
            open_count: counts[d].open === '' ? 0 : counts[d].open
          }));

        const { error: denomError } = await supabase
          .from("denominations")
          .insert(entries);

        if (denomError) {
          console.error("Error saving denominations:", denomError);
          return;
        }

        setDialog({
          show: true,
          message: "Entry saved successfully!",
          type: 'success'
        });
      }

      // Reset form
      setCounts(Object.fromEntries(denominations.map(d => [d, { bundle: '', open: '', total: 0 }])));
      setNote("");
      setEditingEntryId(null);
      
      if (showHistory) {
        fetchDates();
      }
    } catch (err) {
      console.error("Unexpected error in handleSave:", err);
      setDialog({
        show: true,
        message: "An error occurred while saving.",
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    if (entries[entryIndex]?.id) {
      setEditingEntryId(entries[entryIndex].id);
      if (entries[entryIndex]?.note) {
        setNote(entries[entryIndex].note);
      }
      setShowHistory(false);
    }
  };

  const handleDelete = async () => {
    if (!entries[entryIndex]?.id) return;
    
    setDialog({
      show: true,
      message: "Are you sure you want to delete this entry?",
      type: 'confirm',
      onConfirm: async () => {
        setLoading(true);
        try {
          const { error: denomError } = await supabase
            .from("denominations")
            .delete()
            .eq("calculation_id", entries[entryIndex].id);

          if (denomError) {
            console.error("Error deleting denominations:", denomError);
            return;
          }

          const { error: calcError } = await supabase
            .from("calculations")
            .delete()
            .eq("id", entries[entryIndex].id);

          if (calcError) {
            console.error("Error deleting calculation:", calcError);
            return;
          }

          setDialog({
            show: true,
            message: "Entry deleted successfully!",
            type: 'success',
            onClose: () => {
              setDialog({ show: false, message: '', type: '' });
              fetchDates();
            }
          });
        } catch (err) {
          console.error("Unexpected error in handleDelete:", err);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const renderCalculator = () => (
    <div className="calculator-card">
      <div className="header">
        <div className="app-title">Cash Counter</div>
        <button 
          className="history-button"
          onClick={() => {
            setShowHistory(true);
            setEditingEntryId(null);
            setCounts(Object.fromEntries(denominations.map(d => [d, { bundle: '', open: '', total: 0 }])));
            setNote("");
          }}
        >
          History
        </button>
      </div>

      <div className="denominations-container">
        <div className="input-header">
          <span className="header-label">Value</span>
          <span className="header-label">Bundle</span>
          <span className="header-label">Open</span>
          <span className="header-label">Count</span>
          <span className="header-label">Amount</span>
        </div>
        {denominations.map(d => (
          <div key={d} className={`denomination-row ${counts[d].total > 0 ? 'has-value' : 'empty-value'}`}>
            <label className="denomination-label">₹{d}</label>
            <input
              type="number"
              value={counts[d].bundle}
              min="0"
              onChange={(e) => handleChange(d, 'bundle', e.target.value)}
              className="denomination-input"
              placeholder="0"
              aria-label={`Bundle of ₹${d} notes`}
            />
            <input
              type="number"
              value={counts[d].open}
              min="0"
              onChange={(e) => handleChange(d, 'open', e.target.value)}
              className="denomination-input"
              placeholder="0"
              aria-label={`Open ₹${d} notes`}
            />
            <div className="denomination-count">{counts[d].total}</div>
            <div className="denomination-total">
              {d * counts[d].total}
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
            setCounts(Object.fromEntries(denominations.map(d => [d, { bundle: '', open: '', total: 0 }])));
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
        <div className="input-header">
          <span className="header-label">Value</span>
          <span className="header-label">Bundle</span>
          <span className="header-label">Open</span>
          <span className="header-label">Count</span>
          <span className="header-label">Amount</span>
        </div>
        {denominations.map(d => (
          <div key={d} className={`denomination-row ${counts[d].total > 0 ? 'has-value' : 'empty-value'}`}>
            <label className="denomination-label">₹{d}</label>
            <div className="denomination-count">{counts[d].bundle || 0}</div>
            <div className="denomination-count">{counts[d].open || 0}</div>
            <div className="denomination-count">{counts[d].total}</div>
            <div className="denomination-total">
              {d * counts[d].total}
            </div>
          </div>
        ))}
      </div>

      <div className="total-container">
        <div className="history-actions">
          <button 
            className="action-button edit"
            onClick={handleEdit}
            disabled={loading}
            title="Edit"
          >
            <FiEdit2 size={20} />
          </button>
          <button 
            className="action-button delete"
            onClick={handleDelete}
            disabled={loading}
            title="Delete"
          >
            {loading ? "..." : <RiDeleteBin6Line size={20} />}
          </button>
        </div>
        <div className="total-amount history-total">
          <span className="total-label">Total:</span>
          <span className="total-value">₹{total}</span>
        </div>
      </div>
    </div>
  );

  const Dialog = () => {
    if (!dialog.show) return null;

    return (
      <div className="dialog-overlay">
        <div className="dialog">
          <div className={`dialog-content ${dialog.type}`}>
            <p>{dialog.message}</p>
            {dialog.type === 'confirm' ? (
              <div className="dialog-actions">
                <button 
                  onClick={() => {
                    dialog.onConfirm?.();
                    setDialog({ show: false, message: '', type: '' });
                  }}
                  className="confirm-button"
                >
                  Confirm
                </button>
                <button 
                  onClick={() => setDialog({ show: false, message: '', type: '' })}
                  className="cancel-button"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button 
                onClick={() => {
                  dialog.onClose?.();
                  setDialog({ show: false, message: '', type: '' });
                }}
                className="ok-button"
              >
                OK
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="calculator-container">
      <div className="calculator-wrapper">
        {showHistory ? renderHistory() : renderCalculator()}
      </div>
      <Dialog />
    </div>
  );
}
