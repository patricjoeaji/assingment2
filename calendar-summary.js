// Shared Owner calendar and status summary for populated and empty views.
window.JobCalendar = (() => {
  const states = ['Pending', 'Accepted', 'Declined', 'Finished'];
  const key = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const date = value => new Date(`${value}T00:00:00`);
  const status = job => String(job.status || 'Pending').toLowerCase();
  function render({ start, selected, jobs, onSelect, days = 14, summaryAll = false, interactive = false }) {
    const first = date(start), last = date(start);
    last.setDate(last.getDate() + days - 1);
    document.getElementById('dateRange').textContent = `${first.toLocaleDateString('en-AU',{day:'numeric',month:'short'})} – ${last.toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})}`;
    document.querySelectorAll('.container-60 .text-wrapper-130, .container-3 .text-wrapper-3, .worker-view .container-4 .text-wrapper-6').forEach((label,index) => {
      const day = date(start); day.setDate(day.getDate()+index);
      label.textContent = day.toLocaleDateString('en-AU',{weekday:'short'}).toUpperCase();
    });
    const grid = document.getElementById('calendarDays');
    grid.classList.add('job-calendar-days'); grid.replaceChildren();
    for (let i=0;i<days;i++) {
      const day = date(start); day.setDate(day.getDate()+i);
      const dayKey = key(day), entries = jobs.filter(job => job.date === dayKey);
      const button = document.createElement('button'); button.type='button'; button.className='job-calendar-day';
      button.setAttribute('aria-label',`${day.toLocaleDateString('en-AU')}, ${entries.length} jobs`);
      button.setAttribute('aria-pressed',String(dayKey===selected));
      const number=document.createElement('span'); number.className='job-calendar-number'; number.textContent=day.getDate();
      const dots=document.createElement('span'); dots.className='job-calendar-dots';
      entries.forEach(job=>{const dot=document.createElement('span'); dot.className=`job-status-dot job-status-${status(job)}`; dot.setAttribute('aria-hidden','true');dots.append(dot);});
      button.append(number,dots);button.addEventListener('click',()=>onSelect(dayKey,entries));grid.append(button);
    }
    const summary=document.getElementById('calendarSummary'); summary.replaceChildren();
    const range=summaryAll ? jobs : jobs.filter(job=>job.date>=start && job.date<=key(last));
    states.forEach(state=>{
      const cell=document.createElement('div');cell.className='job-summary-cell';
      if (interactive) { cell.dataset.statusFilter=state.toLowerCase(); cell.setAttribute('role','button'); cell.tabIndex=0; }
      const label=document.createElement('span');label.className='job-summary-label';
      const dot=document.createElement('span');dot.className=`job-status-dot job-status-${state.toLowerCase()}`;
      label.append(dot,document.createTextNode(state));
      const count=document.createElement('strong');count.id=`${state.toLowerCase()}Count`;count.textContent=range.filter(job=>status(job)===state.toLowerCase()).length;
      cell.append(label,count);summary.append(cell);
    });
    const total=document.createElement('div');total.className='job-summary-total';
    if (interactive) { total.dataset.statusFilter='all'; total.setAttribute('role','button'); total.tabIndex=0; }
    const label=document.createElement('span');label.textContent='Total jobs';
    const count=document.createElement('strong');count.id='totalCount';count.textContent=range.length;total.append(label,count);summary.append(total);
  }
  return { render };
})();
