import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Pencil, Trash2, Plus, Upload, UserPlus2, Copy, ChevronDown, ChevronRight, FileSpreadsheet, Info } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useLeadStore } from '../stores/leadStore';
import { useTeamStore } from '../stores/teamStore';
import { useUserStore } from '../stores/userStore';
import LeadModal from '../components/modals/LeadModal';
import UploadLeadsModal from '../components/modals/UploadLeadsModal';
import AssignLeadModal from '../components/modals/AssignLeadModal';
import Modal from '../components/modals/Modal';
import ConfirmModal from '../components/modals/ConfirmModal';
import { useToastStore } from '../stores/toastStore';
import type { Lead } from '../stores/leadStore';
import moment from 'moment';
import axiosInstance from '../utils/axiosConfig';
import LiveMarketTickers from '../components/LiveMarketTickers';
import * as XLSX from 'xlsx';
import { filterLeadNotesForViewer, parseLeadNotes } from '../utils/notes';
import PageHeader from '../components/PageHeader';

const formNameForLead = (lead: Lead) => {
  const stored = (lead.metaFormName || '').trim();
  if (stored) return stored;
  const match = (lead.notes || '').match(/Form Name:\s*([^|]+)/i);
  return match?.[1]?.trim() || '';
};

const formatLeadTime = (lead: Lead, useAssignedTime: boolean) => {
  const candidates = useAssignedTime
    ? [lead.assignedAt, lead.date]
    : [lead.date, lead.assignedAt];

  for (const value of candidates) {
    const parsed = value ? moment(value) : null;
    if (parsed?.isValid()) return parsed.format('hh:mm A');
  }

  const notes = parseLeadNotes(lead.notes || '');
  for (let i = notes.length - 1; i >= 0; i--) {
    const parsed = moment(notes[i].timestamp);
    if (parsed.isValid()) return parsed.format('hh:mm A');
  }

  return '—';
};

function LeadsPage() {
  const { role, userId, displayName } = useAuthStore();
  const isSuperAdmin = role === 'super_admin';
  const isAdmin = role === 'admin';
  const isTeamLeader = role === 'team_leader';
  const isRM = role === 'relationship_mgr' || role === 'financial_manager';
  const shouldMaskPhone = isRM || isTeamLeader;
  const { leads, fetchLeads, deleteLead } = useLeadStore();
  const { teams, fetchTeams } = useTeamStore();
  const { users, fetchUsers } = useUserStore();
  const addToast = useToastStore((state) => state.addToast);

  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [currentLead, setCurrentLead] = useState<Lead | null>(null);
  const [infoLead, setInfoLead] = useState<Lead | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [statusColumnFilter, setStatusColumnFilter] = useState('');
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  // Only apply default date filter for admins, not for RMs/financial_managers
  const showDefaultDateRange = isSuperAdmin || isAdmin;
  const [filterFromDate, setFilterFromDate] = useState<string>(
    showDefaultDateRange ? moment().subtract(7, 'days').format('YYYY-MM-DD') : ''
  );
  const [filterToDate, setFilterToDate] = useState<string>('');

  const [selectedRM, setSelectedRM] = useState<string>('');
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragSelecting, setDragSelecting] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState<string | null>(null);

  const [assignedUserFilter, setAssignedUserFilter] = useState('');
  const [showAssignedUserFilter, setShowAssignedUserFilter] = useState(false);
  const [assignedRMFilter, setAssignedRMFilter] = useState('');
  const [showAssignedRMFilter, setShowAssignedRMFilter] = useState(false);
  const [nameFilter, setNameFilter] = useState('');
  const [showNameFilter, setShowNameFilter] = useState(false);
  const [phoneFilter, setPhoneFilter] = useState('');
  const [showPhoneFilter, setShowPhoneFilter] = useState(false);
  const [tagsFilter, setTagsFilter] = useState('');
  const [showAssignSection, setShowAssignSection] = useState(false);
  const [showFiltersSection, setShowFiltersSection] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pendingFocusLeadId, setPendingFocusLeadId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const LEADS_PER_PAGE = 50;

  const statusFilterRef = useRef<HTMLDivElement>(null);
  const assignedFilterRef = useRef<HTMLDivElement>(null);
  const assignedRMFilterRef = useRef<HTMLDivElement>(null);
  const nameFilterRef = useRef<HTMLDivElement>(null);
  const phoneFilterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (role && userId) {
      console.log(`🔍 LeadsPage: Fetching leads for role: ${role}, userId: ${userId}`);
      fetchLeads();
      fetchTeams();
      fetchUsers();
    }
  }, [role, userId]);

  useEffect(() => {
    const status = searchParams.get('status');
    const leadId = searchParams.get('leadId');
    const name = searchParams.get('name');

    if (status) {
      setStatusColumnFilter(status);
      setShowFiltersSection(true);
    }
    if (name) {
      setNameFilter(name);
      setShowFiltersSection(true);
    }
    if (leadId) {
      setPendingFocusLeadId(leadId);
    }
  }, [searchParams]);
  
  // Debug: Log leads when they change
  useEffect(() => {
    if (role === 'relationship_mgr' && leads.length > 0) {
      console.log(`📊 RM sees ${leads.length} total leads from API`);
      const assignedToMe = leads.filter(l => l.assigned_to === userId);
      console.log(`✅ RM sees ${assignedToMe.length} leads assigned to me (userId: ${userId})`);
      if (assignedToMe.length > 0) {
        console.log(`   Sample lead assigned_to: ${assignedToMe[0].assigned_to}`);
      }
    }
  }, [leads, role, userId]);

  // Close status filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        statusFilterRef.current &&
        statusFilterRef.current.contains(event.target as Node)
      ) {
        return;
      }
      if (assignedFilterRef.current && assignedFilterRef.current.contains(event.target as Node)) {
        return;
      }
      if (assignedRMFilterRef.current && assignedRMFilterRef.current.contains(event.target as Node)) {
        return;
      }
      if (nameFilterRef.current && nameFilterRef.current.contains(event.target as Node)) {
        return;
      }
      if (phoneFilterRef.current && phoneFilterRef.current.contains(event.target as Node)) {
        return;
      }
      setShowStatusFilter(false);
      setShowAssignedUserFilter(false);
      setShowAssignedRMFilter(false);
      setShowNameFilter(false);
      setShowPhoneFilter(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleAddLead = () => {
    setCurrentLead(null);
    setIsLeadModalOpen(true);
  };

  const handleEditLead = (lead: Lead) => {
    setCurrentLead(lead);
    setIsLeadModalOpen(true);
  };

  const handleDeleteLead = (leadId: string) => {
    setLeadToDelete(leadId);
  };

  const confirmDelete = () => {
    if (leadToDelete) {
      if (leadToDelete.includes(',')) {
        // Bulk delete
        const leadIds = leadToDelete.split(',');
        Promise.all(leadIds.map(id => deleteLead(id)))
          .then(() => {
            addToast(`${leadIds.length} leads deleted successfully`, 'success');
            setSelectedLeads([]);
            setLeadToDelete(null);
            fetchLeads();
          })
          .catch((err) => {
            console.error('Failed to delete leads:', err);
            addToast('Failed to delete some leads', 'error');
            setLeadToDelete(null);
          });
      } else {
        // Single delete
        deleteLead(leadToDelete);
        setLeadToDelete(null);
      }
    }
  };

  const handleBulkDelete = () => {
    if (selectedLeads.length === 0) {
      addToast('Please select at least one lead to delete', 'error');
      return;
    }
    setLeadToDelete(selectedLeads.join(','));
  };


  const handleBulkAssign = async () => {
    if (!selectedRM || selectedLeads.length === 0) {
      addToast('Please select at least one lead and an RM', 'error');
      return;
    }

    try {
      await Promise.all(
        selectedLeads.map((leadId) =>
          axiosInstance.patch(`/leads/${leadId}/assign`, {
            assigned_to: selectedRM
          })
        )
      );

      addToast('Selected leads assigned successfully', 'success');
      setSelectedLeads([]);
      fetchLeads();
    } catch (err) {
      console.error('Failed to assign leads:', err);
      addToast('Failed to assign leads', 'error');
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLInputElement>, leadId: string) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragSelecting(!selectedLeads.includes(leadId));
    toggleLeadSelection(leadId, !selectedLeads.includes(leadId));
  };

  const handleMouseEnter = (leadId: string) => {
    if (!isDragging) return;
    toggleLeadSelection(leadId, dragSelecting);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const toggleLeadSelection = (leadId: string, select: boolean) => {
    if (select) {
      setSelectedLeads((prev) => [...new Set([...prev, leadId])]);
    } else {
      setSelectedLeads((prev) => prev.filter((id) => id !== leadId));
    }
  };

  const getStatusColor = (status: string) => {
  switch (status) {
    case 'New':
      return 'bg-cyan-500/20 text-cyan-400';
    case 'Free Trial':
      return 'bg-indigo-500/20 text-indigo-400';
    case 'Free Trial – Follow Up':
      return 'bg-indigo-400/20 text-indigo-300';
    case 'Follow Up (No Response)':
      return 'bg-teal-500/20 text-teal-400';
    case 'Promise To Pay':
      return 'bg-yellow-500/20 text-yellow-400';
    case 'Paid Client':
      return 'bg-emerald-500/20 text-emerald-400';
    case 'Follow Up':
      return 'bg-teal-500/20 text-teal-400';
    case 'Call Back With Presentation':
      return 'bg-orange-500/20 text-orange-400';
    case 'Call Back Without Presentation':
      return 'bg-orange-400/20 text-orange-300';
    case 'Not Interested':
      return 'bg-pink-500/20 text-pink-400';
    case 'Non Trader':
      return 'bg-gray-600/20 text-gray-400';
    case 'Less Funds':
      return 'bg-red-600/20 text-red-500';
    case 'Language Barrier':
      return 'bg-purple-600/20 text-purple-400';
    case 'Disconnected Call':
      return 'bg-gray-500/20 text-gray-300';
    case 'Switched Off':
      return 'bg-gray-500/20 text-gray-300';
    case 'Ringing':
      return 'bg-blue-500/20 text-blue-400';
    case 'Not Reachable':
      return 'bg-yellow-600/20 text-yellow-500';
    case 'Out Of Service':
      return 'bg-red-500/20 text-red-400';
    case 'Busy':
      return 'bg-yellow-600/20 text-yellow-500';
    case 'Incoming Calls Not Allowed':
      return 'bg-red-500/20 text-red-400';
    case 'Invalid Number':
      return 'bg-red-500/20 text-red-400';
    case 'Loss Client':
      return 'bg-red-700/20 text-red-500';
    case 'Won':
      return 'bg-green-600/20 text-green-400';
    case 'Do Not Disturb':
      return 'bg-slate-600/20 text-slate-400';
    case 'Summarization Call':
      return 'bg-blue-600/20 text-blue-400';
    case 'Counselling Call':
      return 'bg-purple-500/20 text-purple-400';
    case 'Equity Client':
      return 'bg-emerald-600/20 text-emerald-400';
    default:
      return 'bg-gray-400/20 text-gray-300';
  }
};

  const filteredLeads = leads.filter((lead) => {
  // Filter out "Won" and "Paid Client" leads for all users
  if (lead.status === 'Won' || lead.status === 'Paid Client') return false;
  
  // For RMs and Financial Managers, only show leads assigned to them
  // Note: Backend already filters this, but keeping for safety
  if (
    (role === 'relationship_mgr' || role === 'financial_manager') &&
    lead.assigned_to !== userId
  ) {
    // Debug logging
    if (role === 'relationship_mgr') {
      console.log(`🔍 Lead ${lead.id} filtered out - assigned_to: ${lead.assigned_to}, userId: ${userId}, match: ${lead.assigned_to === userId}`);
    }
    return false;
  }
  
  // For team leaders, only show leads from their team
  if (role === 'team_leader' && lead.team_id !== users.find(u => u.id === userId)?.team_id)
    return false;

  if ((isSuperAdmin || isAdmin) && assignedUserFilter) {
    if (assignedUserFilter === 'unassigned' && lead.assigned_to) return false;
    if (assignedUserFilter !== 'unassigned' && lead.assigned_to !== assignedUserFilter) return false;
  }

  if (isTeamLeader && assignedRMFilter) {
    if (assignedRMFilter === 'unassigned' && lead.assigned_to) return false;
    if (assignedRMFilter !== 'unassigned' && lead.assigned_to !== assignedRMFilter) return false;
  }
  
  // Additional filters
  if (statusFilter === 'assigned' && !lead.assigned_to) return false;
  if (statusFilter === 'unassigned' && lead.assigned_to) return false;
  if (statusColumnFilter && lead.status !== statusColumnFilter) return false;
  if (nameFilter && !lead.fullName.toLowerCase().includes(nameFilter.toLowerCase())) return false;
  if (phoneFilter) {
    const leadPhone = String(lead.phone || '').replace(/\D/g, '');
    const filterDigits = String(phoneFilter).replace(/\D/g, '');
    if (filterDigits && !leadPhone.includes(filterDigits)) return false;
  }
  if (tagsFilter && tagsFilter !== '') {
    const leadTags = (lead.tags || '').toLowerCase().split(',').map(t => t.trim());
    const filterTag = tagsFilter.toLowerCase();
    if (!leadTags.some(tag => tag === filterTag)) return false;
  }
  // Only apply date filters for admins, not for RMs/financial_managers
  if (isSuperAdmin || isAdmin || isTeamLeader) {
    if (filterFromDate && moment(lead.date).isBefore(moment(filterFromDate), 'day')) return false;
    if (filterToDate && moment(lead.date).isAfter(moment(filterToDate), 'day')) return false;
  }
  return true;
});

  const totalFiltered = filteredLeads.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / LEADS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedLeads = filteredLeads.slice(
    (safePage - 1) * LEADS_PER_PAGE,
    safePage * LEADS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [
    statusFilter,
    statusColumnFilter,
    nameFilter,
    phoneFilter,
    tagsFilter,
    assignedUserFilter,
    assignedRMFilter,
    filterFromDate,
    filterToDate,
  ]);

  useEffect(() => {
    if (!pendingFocusLeadId || leads.length === 0) return;

    const lead = leads.find((l) => l.id === pendingFocusLeadId);
    if (!lead) return;

    const index = filteredLeads.findIndex((l) => l.id === pendingFocusLeadId);
    if (index === -1) return;

    const page = Math.floor(index / LEADS_PER_PAGE) + 1;
    setCurrentPage(page);
    setInfoLead(filteredLeads[index]);
    setPendingFocusLeadId(null);
    setSearchParams({}, { replace: true });
  }, [pendingFocusLeadId, leads, filteredLeads, setSearchParams]);

  const handleExportToExcel = () => {
    try {
      if (filteredLeads.length === 0) {
        addToast('No leads to export', 'error');
        return;
      }

      const noteAttemptsForExport = (notesRaw: string | undefined) => {
        if (!notesRaw) return [];
        return notesRaw
          .split('||')
          .map((entry) => {
            const parts = entry.split('__');
            return {
              status: parts[0] || '',
              note: parts[1] || '',
              timestamp: parts[2] || '',
            };
          })
          .filter((a) => a.status || a.note || a.timestamp);
      };

      const maxAttempts = filteredLeads.reduce((max, lead) => {
        const count = noteAttemptsForExport(lead.notes).length;
        return Math.max(max, count);
      }, 0);

      const rows = filteredLeads.map((lead) => {
        const attempts = noteAttemptsForExport(lead.notes);
        const attemptsCols: Record<string, string> = {};

        for (let i = 0; i < maxAttempts; i++) {
          const a = attempts[i];
          const attemptLabel = `Attempt ${i + 1}`;
          attemptsCols[attemptLabel] = a
            ? `${a.status || '—'}${a.note ? ` — ${a.note}` : ''}${a.timestamp ? ` (${a.timestamp})` : ''}`
            : '';
        }

        return {
        ID: lead.id,
        Date: lead.date ? moment(lead.date).format('YYYY-MM-DD') : '',
        Time: formatLeadTime(lead, false),
        'Full Name': lead.fullName || '',
        Phone: lead.phone || '',
        ...(isSuperAdmin ? { 'Form Name': formNameForLead(lead) } : {}),
        Email: lead.email || '',
        'Alt Number': lead.altNumber || '',
        Status: lead.status || '',
        Team: teams.find((t) => t.id === lead.team_id)?.name || '',
        'Assigned To': lead.assigned_to ? getAssignedUserName(lead.assigned_to) : 'Unassigned',
        'Assigned Date': lead.assignedAt ? moment(lead.assignedAt).format('YYYY-MM-DD') : '',
        Segment: lead.segment || '',
        Capital: lead.capital || '',
        Profession: lead.profession || '',
        State: lead.stateName || '',
        Language: lead.language || '',
        Tags: lead.tags || '',
        ...attemptsCols,
        'Won On': lead.wonOn ? moment(lead.wonOn).format('YYYY-MM-DD') : '',
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Leads');

      const fileName = `leads_${moment().format('YYYYMMDD_HHmm')}.xlsx`;
      XLSX.writeFile(wb, fileName);
      addToast(`Exported ${filteredLeads.length} leads to Excel`, 'success');
    } catch (err) {
      console.error('Export to Excel failed:', err);
      addToast('Failed to export leads', 'error');
    }
  };


  const availableUsers = users.filter(user => {
    // Only show active users
    if (user.status?.toLowerCase() !== 'active') return false;
    
    if (role === 'super_admin') 
      return user.role === 'relationship_mgr' || user.role === 'financial_manager';
    if (role === 'admin')
      return user.role === 'relationship_mgr' || user.role === 'financial_manager';
    return false;
  });

  const getAssignedUserName = (id?: string) =>
    users.find((u) => u.id === id)?.displayName || 'Unassigned';

  const copyMetaValue = (label: string, value?: string) => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    addToast(`${label} copied`, 'success');
  };

  // Get unique tags from all leads for filter dropdown
  const uniqueTags = Array.from(
    new Set(
      leads
        .filter(lead => lead.tags && lead.tags.trim() !== '')
        .flatMap(lead => {
          return (lead.tags || '').split(',').map(tag => tag.trim()).filter(tag => tag !== '');
        })
    )
  ).sort();

  return (
    <div onMouseUp={handleMouseUp}>
      <LiveMarketTickers />
      <PageHeader
        title="Leads"
        description={`${totalFiltered.toLocaleString('en-IN')} in the current view`}
        actions={
          (role === 'super_admin' || role === 'admin' || role === 'relationship_mgr' || role === 'financial_manager') ? (
            <>
              <button type="button" className="btn btn-primary" onClick={handleAddLead}>
                <Plus size={16} />
                Add Lead
              </button>
              {(role === 'super_admin' || role === 'admin') && (
                <button type="button" className="btn btn-secondary" onClick={() => setIsUploadModalOpen(true)}>
                  <Upload size={16} />
                  Upload Leads
                </button>
              )}
            </>
          ) : null
        }
      />

      {/* Filters */}
      {(isSuperAdmin || isAdmin || isTeamLeader) && (
        <div className="mb-6 space-y-2">
          {/* Assign Leads Section - Collapsible */}
          {(isSuperAdmin || isAdmin) && (
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              <button
                onClick={() => setShowAssignSection(!showAssignSection)}
                className="w-full flex items-center justify-between p-4 hover:bg-surface-hover transition-colors"
              >
                <div className="flex items-center gap-2">
                  {showAssignSection ? (
                    <ChevronDown size={16} className="text-gray-400" />
                  ) : (
                    <ChevronRight size={16} className="text-gray-400" />
                  )}
                  <UserPlus2 size={16} className="text-blue-400" />
                  <h3 className="text-sm font-semibold text-gray-300">Assign Leads</h3>
                </div>
              </button>
              {showAssignSection && (
                <div className="px-4 pb-4">
                  <div className="flex flex-wrap gap-3 items-end">
                    <div className="flex flex-col text-xs">
                      <label className="font-medium text-gray-400 mb-1">Select Team</label>
                      <select
                        className="form-input bg-gray-900 border border-gray-700 text-gray-200 text-xs rounded-md px-3 py-2 w-40"
                        value={selectedTeam}
                        onChange={(e) => {
                          setSelectedTeam(e.target.value);
                          setSelectedRM('');
                        }}
                      >
                        <option value="">Select</option>
                        {teams.map((team) => (
                          <option key={team.id} value={team.id}>{team.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col text-xs">
                      <label className="font-medium text-gray-400 mb-1">Select RM</label>
                      <select
                        className="form-input bg-gray-900 border border-gray-700 text-gray-200 text-xs rounded-md px-3 py-2 w-40"
                        value={selectedRM}
                        onChange={(e) => setSelectedRM(e.target.value)}
                        disabled={!selectedTeam}
                      >
                        <option value="">Select</option>
                        {users
                          .filter(
                            (user) =>
                              (user.role === 'relationship_mgr' || user.role === 'financial_manager') &&
                              user.team_id === selectedTeam &&
                              user.status?.toLowerCase() === 'active'
                          )
                          .map((rm) => (
                            <option key={rm.id} value={rm.id}>
                              {rm.displayName}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="flex items-end gap-2">
                      <button
                        className="btn btn-primary flex items-center px-3 py-2 text-xs"
                        onClick={handleBulkAssign}
                        disabled={!selectedRM || selectedLeads.length === 0}
                      >
                        <UserPlus2 size={14} className="mr-1" />
                        Assign Leads
                      </button>
                      <button
                        className="btn btn-danger px-3 py-2 text-xs"
                        onClick={handleBulkDelete}
                        disabled={selectedLeads.length === 0}
                      >
                        <Trash2 size={14} className="mr-1" />
                        Delete {selectedLeads.length > 0 ? `${selectedLeads.length} ` : ''}Leads
                      </button>
                      <button
                        className="btn btn-success px-3 py-2 text-xs"
                        onClick={handleExportToExcel}
                        disabled={filteredLeads.length === 0}
                      >
                        <FileSpreadsheet size={14} className="mr-1" />
                        Export to Excel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Filters Section - Collapsible */}
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <button
              onClick={() => setShowFiltersSection(!showFiltersSection)}
              className="w-full flex items-center justify-between p-4 hover:bg-surface-hover transition-colors"
            >
              <div className="flex items-center gap-2">
                {showFiltersSection ? (
                  <ChevronDown size={16} className="text-gray-400" />
                ) : (
                  <ChevronRight size={16} className="text-gray-400" />
                )}
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                <h3 className="text-sm font-semibold text-gray-300">Filters</h3>
              </div>
            </button>
            {showFiltersSection && (
              <div className="px-4 pb-4">
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="flex flex-col text-xs">
                    <label className="font-medium text-gray-400 mb-1">From Date</label>
                    <input
                      type="date"
                      value={filterFromDate}
                      onChange={(e) => setFilterFromDate(e.target.value)}
                      className="form-input bg-gray-900 border border-gray-700 text-gray-200 text-xs rounded-md px-3 py-2 w-40"
                    />
                  </div>

                  <div className="flex flex-col text-xs">
                    <label className="font-medium text-gray-400 mb-1">To Date</label>
                    <input
                      type="date"
                      value={filterToDate}
                      onChange={(e) => setFilterToDate(e.target.value)}
                      className="form-input bg-gray-900 border border-gray-700 text-gray-200 text-xs rounded-md px-3 py-2 w-40"
                    />
                  </div>

                  {(isSuperAdmin || isAdmin) && (
                    <div className="flex flex-col text-xs">
                      <label className="font-medium text-gray-400 mb-1">Assigned Status</label>
                      <select
                        className="form-input bg-gray-900 border border-gray-700 text-gray-200 text-xs rounded-md px-3 py-2 w-40"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                      >
                        <option value="">All Status</option>
                        <option value="assigned">Assigned</option>
                        <option value="unassigned">Unassigned</option>
                      </select>
                    </div>
                  )}

                  <div className="flex flex-col text-xs">
                    <label className="font-medium text-gray-400 mb-1">Tags</label>
                    <select
                      className="form-input bg-gray-900 border border-gray-700 text-gray-200 text-xs rounded-md px-3 py-2 w-40"
                      value={tagsFilter}
                      onChange={(e) => setTagsFilter(e.target.value)}
                    >
                      <option value="">All Tags</option>
                      {uniqueTags.map((tag) => (
                        <option key={tag} value={tag}>
                          {tag}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="table-panel">
        <div className="max-h-[80vh] overflow-auto">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="sticky top-0 bg-shell text-xs uppercase text-gray-400">
              <tr>
                <th className="w-10 p-2">
                  <input
                    type="checkbox"
                    className="rounded bg-gray-800 border-gray-600"
                    checked={paginatedLeads.length > 0 && paginatedLeads.every((l) => selectedLeads.includes(l.id))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedLeads((prev) => [...new Set([...prev, ...paginatedLeads.map((l) => l.id)])]);
                      } else {
                        const pageIds = new Set(paginatedLeads.map((l) => l.id));
                        setSelectedLeads((prev) => prev.filter((id) => !pageIds.has(id)));
                      }
                    }}
                  />
                </th>
                {isRM ? (
                  <>
                    <th className="w-28 p-2 text-xs">Assigned Date</th>
                    <th className="p-2 text-xs">Time</th>
                  </>
                ) : (
                  <>
                    <th className="w-28 p-2 text-xs">Date</th>
                    <th className="p-2 text-xs">Time</th>
                    {isTeamLeader && <th className="w-28 p-2 text-xs">Assigned Date</th>}
                  </>
                )}
                <th className="w-40 p-2 text-xs relative">
                  <div ref={nameFilterRef} className="flex items-center gap-1 relative">
                    <span>Full Name</span>
                    <button
                      onClick={() => setShowNameFilter(!showNameFilter)}
                      className="text-gray-400 hover:text-white"
                      title="Filter by Name"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                      </svg>
                    </button>
                    {showNameFilter && (
                      <div className="absolute right-0 mt-1 z-10 bg-gray-900 border border-gray-700 rounded-md p-2 shadow-lg">
                        <input
                          type="text"
                          className="form-input bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded-md px-2 py-1 w-48"
                          placeholder="Search name (e.g., Solanki Rahul)"
                          value={nameFilter}
                          onChange={(e) => setNameFilter(e.target.value)}
                          autoFocus
                        />
                        {nameFilter && (
                          <button
                            onClick={() => setNameFilter('')}
                            className="mt-1 text-xs text-gray-400 hover:text-white"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </th>

                <th className="w-32 p-2 text-xs relative">
                  <div ref={phoneFilterRef} className="flex items-center gap-1 relative">
                    <span>Phone</span>
                    <button
                      onClick={() => setShowPhoneFilter(!showPhoneFilter)}
                      className="text-gray-400 hover:text-white"
                      title="Filter by Phone"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                      </svg>
                    </button>
                    {showPhoneFilter && (
                      <div className="absolute right-0 mt-1 z-10 bg-gray-900 border border-gray-700 rounded-md p-2 shadow-lg">
                        <input
                          type="text"
                          inputMode="numeric"
                          className="form-input bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded-md px-2 py-1 w-40"
                          placeholder="Search phone (digits)"
                          value={phoneFilter}
                          onChange={(e) => setPhoneFilter(e.target.value)}
                          autoFocus
                        />
                        {phoneFilter && (
                          <button
                            onClick={() => setPhoneFilter('')}
                            className="mt-1 text-xs text-gray-400 hover:text-white"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </th>
                {isSuperAdmin && <th className="w-40 p-2 text-xs">Form Name</th>}

                {(role === 'super_admin' || role === 'admin') ? (
                  <>
                    <th className="w-48 p-2 text-xs relative">
                      <div ref={assignedFilterRef} className="flex items-center gap-1 relative">
                        <span>Assigned To</span>
                        <button
                          onClick={() => setShowAssignedUserFilter(!showAssignedUserFilter)}
                          className="text-gray-400 hover:text-white"
                          title="Filter Assigned To"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                          </svg>
                        </button>
                        {showAssignedUserFilter && (
                          <select
                            className="mt-1 form-input bg-gray-900 border border-gray-700 text-gray-200 text-xs rounded-md absolute right-0 z-10"
                            value={assignedUserFilter}
                            onChange={(e) => setAssignedUserFilter(e.target.value)}
                          >
                            <option value="">All</option>
                            <option value="unassigned">Unassigned</option>
                            {users
                              .filter(
                                (user) =>
                                  (user.role === 'relationship_mgr' || user.role === 'financial_manager') &&
                                  user.status?.toLowerCase() === 'active'
                              )
                              .map((user) => (
                                <option key={user.id} value={user.id}>
                                  {user.displayName}
                                </option>
                              ))}
                          </select>
                        )}
                      </div>
                    </th>
                  </>
                ) : role === 'team_leader' ? (
                  <th className="w-48 p-2 text-xs relative">
                    <div ref={assignedRMFilterRef} className="flex items-center gap-1 relative">
                      <span>Assigned RM</span>
                      <button
                        onClick={() => setShowAssignedRMFilter(!showAssignedRMFilter)}
                        className="text-gray-400 hover:text-white"
                        title="Filter Assigned RM"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                      </button>
                      {showAssignedRMFilter && (
                        <select
                          className="mt-1 form-input bg-gray-900 border border-gray-700 text-gray-200 text-xs rounded-md absolute right-0 z-10"
                          value={assignedRMFilter}
                          onChange={(e) => setAssignedRMFilter(e.target.value)}
                        >
                          <option value="">All</option>
                          <option value="unassigned">Unassigned</option>
                          {users
                            .filter(
                              (user) =>
                                (user.role === 'relationship_mgr' || user.role === 'financial_manager') &&
                                user.team_id === users.find((u) => u.id === userId)?.team_id &&
                                user.status?.toLowerCase() === 'active'
                            )
                            .map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.displayName}
                              </option>
                            ))}
                        </select>
                      )}
                    </div>
                  </th>
                ) : (
                  <th className="w-48 p-2 text-xs">Email</th>
                )}

                <th className="w-28 p-2 text-xs relative">
                  <div ref={statusFilterRef} className="flex items-center gap-1 relative">
                    <span>Status</span>
                    <button
                      onClick={() => setShowStatusFilter(!showStatusFilter)}
                      className="text-gray-400 hover:text-white"
                      title="Filter Status"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                      </svg>
                    </button>
                    {showStatusFilter && (
                      <select
                        className="mt-1 form-input bg-gray-900 border border-gray-700 text-gray-200 text-xs rounded-md absolute right-0 z-10"
                        value={statusColumnFilter}
                        onChange={(e) => setStatusColumnFilter(e.target.value)}
                      >
                        <option value="">All</option>
                        <option value="New">New</option>
                        <option value="Free Trial">Free Trial</option>
                        <option value="Free Trial – Follow Up">Free Trial – Follow Up</option>
                        <option value="Follow Up (No Response)">Follow Up (No Response)</option>
                        <option value="Promise To Pay">Promise To Pay</option>
                        <option value="Paid Client">Paid Client</option>
                        <option value="Follow Up">Follow Up</option>
                        <option value="Call Back With Presentation">Call Back With Presentation</option>
                        <option value="Call Back Without Presentation">Call Back Without Presentation</option>
                        <option value="Not Interested">Not Interested</option>
                        <option value="Non Trader">Non Trader</option>
                        <option value="Less Funds">Less Funds</option>
                        <option value="Language Barrier">Language Barrier</option>
                        <option value="Disconnected Call">Disconnected Call</option>
                        <option value="Switched Off">Switched Off</option>
                        <option value="Ringing">Ringing</option>
                        <option value="Not Reachable">Not Reachable</option>
                        <option value="Out Of Service">Out Of Service</option>
                        <option value="Busy">Busy</option>
                        <option value="Incoming Calls Not Allowed">Incoming Calls Not Allowed</option>
                        <option value="Invalid Number">Invalid Number</option>
                        <option value="Loss Client">Loss Client</option>
                        <option value="Won">Won</option>
                        <option value="Do Not Disturb">Do Not Disturb</option>
                        <option value="Summarization Call">Summarization Call</option>
                        <option value="Counselling Call">Counselling Call</option>
                        <option value="Equity Client">Equity Client</option>

                      </select>
                    )}
                  </div>
                </th>
                {(isSuperAdmin || isAdmin) && (
                  <th className="p-2 text-xs">Tags</th>
                )}
                {(isSuperAdmin || isAdmin) && (
                  <th className="p-2 text-xs">Language</th>
                )}
                <th className="w-32 p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {paginatedLeads.length === 0 && (
                <tr>
                  <td colSpan={20} className="px-4 py-10 text-center text-sm text-gray-400">
                    No leads match the current filters.
                  </td>
                </tr>
              )}
              {paginatedLeads.map((lead) => (
                <tr key={lead.id} className="transition-colors hover:bg-surface-hover">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      className="rounded bg-gray-800 border-gray-600"
                      checked={selectedLeads.includes(lead.id)}
                      onChange={() => {}}
                      onMouseDown={(e) => handleMouseDown(e, lead.id)}
                      onMouseEnter={() => handleMouseEnter(lead.id)}
                    />
                  </td>
                  {isRM ? (
                    <>
                      <td className="p-2 text-xs">
                        {lead.assignedAt ? moment(lead.assignedAt).format('DD MMM YYYY') : '—'}
                      </td>
                      <td className="p-2 text-xs">
                        {formatLeadTime(lead, true)}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-2 text-xs">
                        {lead.date ? moment(lead.date).format('DD MMM YYYY') : '—'}
                      </td>
                      <td className="p-2 text-xs">
                        {formatLeadTime(lead, false)}
                      </td>
                      {isTeamLeader && (
                        <td className="p-2 text-xs">
                          {lead.assignedAt ? moment(lead.assignedAt).format('DD MMM YYYY') : '—'}
                        </td>
                      )}
                    </>
                  )}
<td className="p-2 truncate text-xs">{lead.fullName}</td>

                  <td className="p-2 truncate text-xs flex items-center gap-1">
                    {shouldMaskPhone
                      ? lead.phone
                        ? `${lead.phone.slice(0, 2)}******`
                        : '—'
                      : lead.phone || '—'}
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(lead.phone);
                        addToast('Phone number copied', 'success');
                      }}
                      className="text-gray-400 hover:text-gray-200"
                      title="Copy Phone"
                    >
                      <Copy size={14} />
                    </button>
                  </td>
                  {isSuperAdmin && (
                    <td className="p-2 truncate text-xs" title={formNameForLead(lead) || undefined}>
                      {formNameForLead(lead) || '—'}
                    </td>
                  )}
                  {(role === 'super_admin' || role === 'admin') ? (
                    <td className="p-2 truncate text-xs">{getAssignedUserName(lead.assigned_to)}</td>
                  ) : role === 'team_leader' ? (
                    <td className="p-2 truncate text-xs">{getAssignedUserName(lead.assigned_to)}</td>
                  ) : (
                    <td className="p-2 truncate text-xs">{lead.email}</td>
                  )}

                  <td className="p-2">
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(lead.status)}`}>
                      {lead.status}
                    </span>
                  </td>
                  {(isSuperAdmin || isAdmin) && (
                    <td className="p-2 truncate text-xs">
                      {lead.tags && lead.tags.trim() !== '' ? (
                        lead.tags.split(',').map((tag, index) => (
                          <span key={index} className="inline-block px-2 py-1 text-xs rounded-full bg-purple-500/20 text-purple-400 mr-1 mb-1">
                            {tag.trim()}
                          </span>
                        ))
                      ) : '—'}
                    </td>
                  )}
                  {(isSuperAdmin || isAdmin) && (
                    <td className="p-2 truncate text-xs">
                      {lead.language || '—'}
                    </td>
                  )}
                  <td className="p-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setInfoLead(lead)}
                      className="icon-btn text-sky-300"
                      aria-label={`View ${lead.fullName || 'lead'}`}
                      title="View Info"
                    >
                      <Info size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Edit ${lead.fullName || 'lead'}`}
                      onClick={() => handleEditLead(lead)}
                      className="icon-btn text-sky-300"
                    >
                      <Pencil size={16} />
                    </button>
      {(isSuperAdmin || isAdmin) && (
                      <>
                        <button
                          type="button"
                          aria-label={`Delete ${lead.fullName || 'lead'}`}
                          onClick={() => handleDeleteLead(lead.id)}
                          className="icon-btn icon-btn-danger"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalFiltered > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-700">
            <p className="text-xs text-gray-400">
              Showing {(safePage - 1) * LEADS_PER_PAGE + 1}–{Math.min(safePage * LEADS_PER_PAGE, totalFiltered)} of {totalFiltered} leads
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="px-3 py-1 text-xs rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className="text-xs text-gray-300 min-w-[100px] text-center">
                  Page {safePage} of {totalPages}
                </span>
                <button
                  type="button"
                  className="px-3 py-1 text-xs rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Info Modal with Notes */}
      {infoLead && (
        <Modal isOpen={true} onClose={() => setInfoLead(null)} title="Lead Information" size="2xl">
          <div className="space-y-5 text-gray-200 text-sm">
            {/* Profile header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pb-4 border-b border-gray-700">
              <div className="min-w-0">
                <h4 className="text-xl font-semibold text-white truncate">{infoLead.fullName || '—'}</h4>
                <p className="text-gray-400 text-xs mt-1">
                  {(role === 'super_admin' || role === 'admin' || role === 'team_leader')
                    ? `Assigned to ${getAssignedUserName(infoLead.assigned_to)}`
                    : infoLead.email || '—'}
                  {' · '}
                  {teams.find(t => t.id === infoLead.team_id)?.name || 'No team'}
                </p>
              </div>
              <span className={`inline-flex self-start px-2.5 py-1 text-xs rounded-full whitespace-nowrap ${getStatusColor(infoLead.status)}`}>
                {infoLead.status}
              </span>
            </div>

            {/* Contact */}
            <section>
              <h5 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Contact</h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-gray-700/80 bg-gray-900/30 p-4">
                <div>
                  <span className="text-gray-500 text-xs uppercase tracking-wide block mb-0.5">Phone</span>
                  <span className={shouldMaskPhone
                    ? (infoLead.phone ? 'text-gray-200' : 'text-gray-500')
                    : (infoLead.phone ? 'text-gray-200' : 'text-gray-500')}>
                    {shouldMaskPhone
                      ? infoLead.phone
                        ? `${infoLead.phone.slice(0, 2)}******`
                        : '—'
                      : infoLead.phone || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 text-xs uppercase tracking-wide block mb-0.5">Alternate Number</span>
                  <span className={infoLead.altNumber ? 'text-gray-200' : 'text-gray-500'}>{infoLead.altNumber || '—'}</span>
                </div>
                {(role === 'super_admin' || role === 'admin' || role === 'team_leader') ? (
                  <div>
                    <span className="text-gray-500 text-xs uppercase tracking-wide block mb-0.5">Assigned To</span>
                    <span className="text-gray-200">{getAssignedUserName(infoLead.assigned_to)}</span>
                  </div>
                ) : (
                  <div>
                    <span className="text-gray-500 text-xs uppercase tracking-wide block mb-0.5">Email</span>
                    <span className={infoLead.email ? 'text-gray-200' : 'text-gray-500'}>{infoLead.email || '—'}</span>
                  </div>
                )}
                <div>
                  <span className="text-gray-500 text-xs uppercase tracking-wide block mb-0.5">Deemat Account</span>
                  <span className={infoLead.deematAccountName ? 'text-gray-200' : 'text-gray-500'}>{infoLead.deematAccountName || '—'}</span>
                </div>
              </div>
            </section>

            {/* Lead Details */}
            <section>
              <h5 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Lead Details</h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-gray-700/80 bg-gray-900/30 p-4">
                <div>
                  <span className="text-gray-500 text-xs uppercase tracking-wide block mb-0.5">Profession</span>
                  <span className={infoLead.profession ? 'text-gray-200' : 'text-gray-500'}>{infoLead.profession || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-500 text-xs uppercase tracking-wide block mb-0.5">State</span>
                  <span className={infoLead.stateName ? 'text-gray-200' : 'text-gray-500'}>{infoLead.stateName || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-500 text-xs uppercase tracking-wide block mb-0.5">Capital</span>
                  <span className={infoLead.capital ? 'text-gray-200' : 'text-gray-500'}>{infoLead.capital || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-500 text-xs uppercase tracking-wide block mb-0.5">Segment</span>
                  <span className={infoLead.segment ? 'text-gray-200' : 'text-gray-500'}>{infoLead.segment || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-500 text-xs uppercase tracking-wide block mb-0.5">Status</span>
                  <span className={`inline-block px-2.5 py-1 text-xs rounded-full ${getStatusColor(infoLead.status)}`}>
                    {infoLead.status}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 text-xs uppercase tracking-wide block mb-0.5">Team</span>
                  <span className={teams.find(t => t.id === infoLead.team_id)?.name ? 'text-gray-200' : 'text-gray-500'}>
                    {teams.find(t => t.id === infoLead.team_id)?.name || '—'}
                  </span>
                </div>
              </div>
            </section>

            {/* Meta Attribution */}
            <section>
              <h5 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Meta Attribution</h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-gray-700/80 bg-gray-900/30 p-4">
                <div>
                  <span className="text-gray-500 text-xs uppercase tracking-wide block mb-0.5">Meta Source</span>
                  <span className={infoLead.metaSource ? 'text-gray-200' : 'text-gray-500'}>{infoLead.metaSource || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-500 text-xs uppercase tracking-wide block mb-0.5">Form Name</span>
                  <span className={infoLead.metaFormName ? 'text-gray-200' : 'text-gray-500'}>{infoLead.metaFormName || '—'}</span>
                </div>
                <div className="min-w-0">
                  <span className="text-gray-500 text-xs uppercase tracking-wide block mb-0.5">Meta Lead ID</span>
                  {infoLead.metaLeadId ? (
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-xs text-gray-200 truncate" title={infoLead.metaLeadId}>{infoLead.metaLeadId}</span>
                      <button
                        type="button"
                        onClick={() => copyMetaValue('Meta Lead ID', infoLead.metaLeadId)}
                        className="text-gray-400 hover:text-white shrink-0"
                        title="Copy Meta Lead ID"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  ) : (
                    <span className="text-gray-500">—</span>
                  )}
                </div>
                <div className="min-w-0">
                  <span className="text-gray-500 text-xs uppercase tracking-wide block mb-0.5">Meta Ad ID</span>
                  {infoLead.metaAdId ? (
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-xs text-gray-200 truncate" title={infoLead.metaAdId}>{infoLead.metaAdId}</span>
                      <button
                        type="button"
                        onClick={() => copyMetaValue('Meta Ad ID', infoLead.metaAdId)}
                        className="text-gray-400 hover:text-white shrink-0"
                        title="Copy Meta Ad ID"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  ) : (
                    <span className="text-gray-500">—</span>
                  )}
                </div>
                <div className="min-w-0 sm:col-span-2">
                  <span className="text-gray-500 text-xs uppercase tracking-wide block mb-0.5">CTWA Click ID</span>
                  {infoLead.ctwaClid ? (
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-xs text-gray-200 truncate" title={infoLead.ctwaClid}>{infoLead.ctwaClid}</span>
                      <button
                        type="button"
                        onClick={() => copyMetaValue('CTWA Click ID', infoLead.ctwaClid)}
                        className="text-gray-400 hover:text-white shrink-0"
                        title="Copy CTWA Click ID"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  ) : (
                    <span className="text-gray-500">—</span>
                  )}
                </div>
                <div>
                  <span className="text-gray-500 text-xs uppercase tracking-wide block mb-0.5">Form ID</span>
                  <span className={infoLead.metaFormId ? 'font-mono text-xs text-gray-200' : 'text-gray-500'}>{infoLead.metaFormId || '—'}</span>
                </div>
              </div>
            </section>

            {/* Notes */}
            <section>
              <h5 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Notes</h5>
              {infoLead.notes ? (
                <div className="rounded-lg border border-gray-700/80 overflow-hidden overflow-x-auto">
                  <table className="w-full text-xs text-gray-300 min-w-[520px]">
                    <thead>
                      <tr className="bg-gray-900/80 text-gray-400 uppercase tracking-wide">
                        <th className="p-2.5 text-left font-medium">Date</th>
                        <th className="p-2.5 text-left font-medium">Time</th>
                        <th className="p-2.5 text-left font-medium">Status</th>
                        <th className="p-2.5 text-left font-medium">Note</th>
                        <th className="p-2.5 text-left font-medium">RM Name</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700/80">
                      {filterLeadNotesForViewer(infoLead.notes, {
                        role,
                        viewerRmName: displayName || '',
                        assignedRmName:
                          users.find((u) => u.id === infoLead.assigned_to)?.display_name ||
                          infoLead.assigned_user_name ||
                          '',
                      }).map((note, index) => {
                        const dateObj = moment(note.timestamp);
                        return (
                          <tr key={index} className="hover:bg-gray-900/40">
                            <td className="p-2.5 whitespace-nowrap">
                              {dateObj.isValid() ? dateObj.format('DD MMM YYYY') : '—'}
                            </td>
                            <td className="p-2.5 whitespace-nowrap">
                              {dateObj.isValid() ? dateObj.format('HH:mm:ss') : '—'}
                            </td>
                            <td className="p-2.5">
                              {note.status ? (
                                <span className={`inline-block px-2 py-0.5 text-[10px] rounded-full ${getStatusColor(note.status)}`}>
                                  {note.status}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="p-2.5">{note.note || '—'}</td>
                            <td className="p-2.5">{note.rmName || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500 text-sm rounded-lg border border-gray-700/80 bg-gray-900/30 p-4">—</p>
              )}
            </section>

            {(infoLead.status === 'Won' || infoLead.status === 'Paid Client') && (
              <section>
                <h5 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Client Details</h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-gray-700/80 bg-gray-900/30 p-4">
                  <div>
                    <span className="text-gray-500 text-xs uppercase tracking-wide block mb-0.5">Gender</span>
                    <span className={infoLead.gender ? 'text-gray-200' : 'text-gray-500'}>{infoLead.gender || '—'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs uppercase tracking-wide block mb-0.5">Date of Birth</span>
                    <span className={infoLead.dob ? 'text-gray-200' : 'text-gray-500'}>{infoLead.dob || '—'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs uppercase tracking-wide block mb-0.5">Age</span>
                    <span className={infoLead.age ? 'text-gray-200' : 'text-gray-500'}>{infoLead.age || '—'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs uppercase tracking-wide block mb-0.5">PAN Card No</span>
                    <span className={infoLead.panCardNumber ? 'text-gray-200' : 'text-gray-500'}>{infoLead.panCardNumber || '—'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs uppercase tracking-wide block mb-0.5">Aadhar Card No</span>
                    <span className={infoLead.aadharCardNumber ? 'text-gray-200' : 'text-gray-500'}>{infoLead.aadharCardNumber || '—'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs uppercase tracking-wide block mb-0.5">Payment History</span>
                    <span className={infoLead.paymentHistory ? 'text-gray-200' : 'text-gray-500'}>{infoLead.paymentHistory || '—'}</span>
                  </div>
                </div>
              </section>
            )}
          </div>
        </Modal>
      )}

      {isLeadModalOpen && (
        <LeadModal isOpen={isLeadModalOpen} onClose={() => setIsLeadModalOpen(false)} lead={currentLead} />
      )}
      {isUploadModalOpen && (
        <UploadLeadsModal isOpen={isUploadModalOpen} onClose={() => setIsUploadModalOpen(false)} />
      )}
      {isAssignOpen && selectedLeadId && (
        <AssignLeadModal
          isOpen={isAssignOpen}
          onClose={() => {
            setIsAssignOpen(false);
            setSelectedLeadId(null);
          }}
          leadId={selectedLeadId}
          availableUsers={availableUsers}
          onAssigned={fetchLeads}
        />
      )}
      {leadToDelete && (
        <ConfirmModal
          isOpen={true}
          onClose={() => setLeadToDelete(null)}
          onConfirm={confirmDelete}
          message={leadToDelete.includes(',') 
            ? `Are you sure you want to delete ${leadToDelete.split(',').length} selected leads?`
            : "Are you sure you want to delete this lead?"
          }
        />
      )}
    </div>
  );
}

export default LeadsPage;
