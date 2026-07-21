'use strict';
/**
 * AUTO-GENERATED from hrms/data/pages/*.json by exploration/07_gen_manifest.js
 * (crawl of 80 HRMS pages). Regenerate after a re-crawl:
 *   node hrms/exploration/07_gen_manifest.js
 * Hand-edits: prefer fixing the generator, not this file.
 */
module.exports = [
  {
    "route": "add-visit-report",
    "group": "attendance",
    "title": "Add Vist Report",
    "buttons": [
      "Filter"
    ],
    "columns": [
      "SL.No",
      "IDNumber",
      "Employee Name",
      "CheckIn Time",
      "CheckOut Time",
      "Punch Type",
      "Site Name",
      "Purpose",
      "Site Image",
      "Mobile Location",
      "Location"
    ],
    "tabs": null,
    "quirk": "header misspelled \"Add Vist Report\" (build bug) — asserted as-is"
  },
  {
    "route": "approval-absent",
    "group": "attendance",
    "title": "Approval Absent",
    "buttons": [
      "Filter"
    ],
    "columns": [
      "SL NO",
      "IDNumber",
      "Employee Name",
      "Branch",
      "Department",
      "Date",
      "Period Name",
      "Period Type",
      "Hours Employee Must Work",
      "Approval"
    ],
    "tabs": null
  },
  {
    "route": "approval-absent-report",
    "group": "attendance",
    "title": "Approval Absent Report",
    "buttons": [
      "Filter"
    ],
    "columns": [
      "SL No",
      "IDNumber",
      "Employee Name",
      "Date",
      "Period Name",
      "Start Time",
      "End Time",
      "Balance Hours",
      "Fixed Hours",
      "Fixed Date",
      "Remarks",
      "Final Hours"
    ],
    "tabs": null
  },
  {
    "route": "approval-operation",
    "group": "attendance",
    "title": "Approval Operation",
    "buttons": [
      "Filter"
    ],
    "columns": [
      "SL No",
      "IDNumber",
      "Employee Name",
      "Branch",
      "Date",
      "Entry Time",
      "Exit Time",
      "Status",
      "Period Name",
      "Hours Employee Must Work",
      "Worked Hours",
      "Over Time Hours"
    ],
    "tabs": null
  },
  {
    "route": "approval-operation-report",
    "group": "attendance",
    "title": "Approval Operation Report",
    "buttons": [
      "Filter"
    ],
    "columns": [
      "SL No",
      "IDNumber",
      "Employee Name",
      "Date",
      "Entry Time",
      "Exit Time",
      "Balance Hours",
      "Fixed Hours",
      "Fixed Date",
      "Discount from Permission Hours",
      "Remarks",
      "Final Hours"
    ],
    "tabs": null
  },
  {
    "route": "attendance-finalization",
    "group": "attendance",
    "title": "Attendance Finalization",
    "buttons": [
      "Finalize"
    ],
    "columns": [
      "Sl.No",
      "Period",
      "Scope",
      "Target",
      "Cut-Off",
      "Pending",
      "Status",
      "Action"
    ],
    "tabs": null
  },
  {
    "route": "attendance-log",
    "group": "attendance",
    "title": "Attendance Report",
    "buttons": [
      "Filter"
    ],
    "columns": [
      "SL.No",
      "IDNumber",
      "Employee Name",
      "Date",
      "Period",
      "Employee Status",
      "Entry Time",
      "Exit Time",
      "Worked Hours",
      "Over Time Hours",
      "Balance Working Hours",
      "Must Work Hour"
    ],
    "tabs": null
  },
  {
    "route": "attendance-report-pack",
    "group": "attendance",
    "title": "Attendance",
    "buttons": [
      "Export"
    ],
    "columns": null,
    "tabs": null
  },
  {
    "route": "data-from-device",
    "group": "attendance",
    "title": "Data from device",
    "buttons": [
      "Filter"
    ],
    "columns": [
      "SL.No",
      "ID Number",
      "Employee Name",
      "Punching Time",
      "Punch Type",
      "Recognition Type",
      "Is Registered In System",
      "Device Name",
      "Punching Sync Time",
      "Location",
      "Image"
    ],
    "tabs": null
  },
  {
    "route": "geofences",
    "group": "attendance",
    "title": "Geofence Locations",
    "buttons": [
      "Add Location"
    ],
    "columns": [
      "Sl.No",
      "Scope",
      "Applies To",
      "Name",
      "Lat",
      "Long",
      "Radius",
      "Status",
      "Active"
    ],
    "tabs": null
  },
  {
    "route": "overtime-approval",
    "group": "attendance",
    "title": "Overtime Approval",
    "buttons": [],
    "columns": [
      "Sl.No",
      "Employee",
      "Date",
      "Shift",
      "OT Min",
      "Eligible",
      "Payout",
      "Status",
      "Exported",
      "Action"
    ],
    "tabs": null
  },
  {
    "route": "regularization",
    "group": "attendance",
    "title": "Regularization",
    "buttons": [
      "Submit"
    ],
    "columns": [
      "Sl.No",
      "Employee",
      "Date",
      "Type",
      "In",
      "Out",
      "Reason",
      "Status",
      "Action"
    ],
    "tabs": null
  },
  {
    "route": "shift-roster",
    "group": "attendance",
    "title": "Shift Roster",
    "buttons": [
      "Assign"
    ],
    "columns": [
      "Sl.No",
      "Scope",
      "Target",
      "Shift",
      "From",
      "To",
      "Active"
    ],
    "tabs": null
  },
  {
    "route": "shifts",
    "group": "attendance",
    "title": "Shifts",
    "buttons": [
      "New Shift"
    ],
    "columns": [
      "Sl.No",
      "Shift Name",
      "Type",
      "Timing",
      "Night",
      "Active",
      "Action"
    ],
    "tabs": null
  },
  {
    "route": "timesheet",
    "group": "attendance",
    "title": "Timesheet",
    "buttons": [],
    "columns": [
      "Sl.No",
      "Date",
      "Employee",
      "Shift",
      "Status",
      "Attendance Hrs",
      "Task Hrs",
      "Tasks"
    ],
    "tabs": null
  },
  {
    "route": "approval/config",
    "group": "core-hr",
    "title": "Approval Configuration",
    "buttons": [
      "+ Add level",
      "Save Workflow"
    ],
    "columns": [
      "Type",
      "Name",
      "Approval chain"
    ],
    "tabs": null
  },
  {
    "route": "approvals",
    "group": "core-hr",
    "title": "My Approvals",
    "buttons": [],
    "columns": [
      "Type",
      "Details",
      "Level",
      "As",
      "Raised",
      "Action"
    ],
    "tabs": [
      "Awaiting my decision",
      "My requests",
      "History"
    ]
  },
  {
    "route": "employee-deduction",
    "group": "core-hr",
    "title": "Employee Deduction",
    "buttons": [
      "Save"
    ],
    "columns": null,
    "tabs": null
  },
  {
    "route": "employee-deduction-report",
    "group": "core-hr",
    "title": "Employee Deduction Reports",
    "buttons": [
      "View Report"
    ],
    "columns": null,
    "tabs": null
  },
  {
    "route": "employee-remark",
    "group": "core-hr",
    "title": "Employee Deduction",
    "buttons": [
      "Save"
    ],
    "columns": null,
    "tabs": null,
    "quirk": "header shows \"Employee Deduction\" (build bug) — asserted as-is"
  },
  {
    "route": "employee-remark-report",
    "group": "core-hr",
    "title": "Employee Remark Reports",
    "buttons": [
      "View Report"
    ],
    "columns": null,
    "tabs": null
  },
  {
    "route": "employee-salary-process",
    "group": "core-hr",
    "title": "Employee Salary Process",
    "buttons": [
      "Save"
    ],
    "columns": [
      "Staff Name",
      "Basic Salary",
      "No of Leave",
      "Payable Amount"
    ],
    "tabs": null
  },
  {
    "route": "employees",
    "group": "core-hr",
    "title": "Employees",
    "buttons": [
      "Filter",
      "New Employee"
    ],
    "columns": [
      "Sl.No",
      "Employee Code",
      "Employee Name",
      "Department Name",
      "Designation",
      "Status",
      "Actions"
    ],
    "tabs": null
  },
  {
    "route": "hrms/probation",
    "group": "core-hr",
    "title": "Probation",
    "buttons": [
      "Report",
      "Templates",
      "Start Probation"
    ],
    "columns": [
      "Employee",
      "Branch",
      "Start",
      "End",
      "Reviews",
      "Next Review",
      "Days Left",
      "Action"
    ],
    "tabs": null
  },
  {
    "route": "hrms/probation-report",
    "group": "core-hr",
    "title": "Probation Report",
    "buttons": [
      "Export Excel",
      "Run Report"
    ],
    "columns": [
      "Employee",
      "Branch",
      "Start",
      "End",
      "Outcome",
      "Reviews",
      "Overdue",
      "Decision"
    ],
    "tabs": null
  },
  {
    "route": "hrms/probation-templates",
    "group": "core-hr",
    "title": "Probation Templates",
    "buttons": [
      "New Template"
    ],
    "columns": [
      "Name",
      "Duration",
      "Checkpoints (days)",
      "Criteria",
      "Default",
      "Active",
      "Action"
    ],
    "tabs": null
  },
  {
    "route": "letters/generate",
    "group": "core-hr",
    "title": "Generate",
    "buttons": [
      "Preview",
      "Generate"
    ],
    "columns": null,
    "tabs": null
  },
  {
    "route": "letters/templates",
    "group": "core-hr",
    "title": "Letter Templates",
    "buttons": [
      "Merge Fields",
      "Generate Letter",
      "New Template"
    ],
    "columns": [
      "Name",
      "Owner",
      "Type",
      "Subject",
      "Active",
      "Action"
    ],
    "tabs": null
  },
  {
    "route": "resigned-employees",
    "group": "core-hr",
    "title": "Resigned Employees",
    "buttons": [],
    "columns": [
      "SlNo",
      "Date",
      "Name",
      "Phone",
      "Designation",
      "Nationality"
    ],
    "tabs": null
  },
  {
    "route": "salary-revisions",
    "group": "core-hr",
    "title": "Salary Revisions",
    "buttons": [
      "Raise Revision"
    ],
    "columns": [
      "Employee",
      "Branch",
      "Effective",
      "Old",
      "New",
      "%",
      "Status"
    ],
    "tabs": null
  },
  {
    "route": "sections",
    "group": "core-hr",
    "title": "Sections",
    "buttons": [
      "Save"
    ],
    "columns": [
      "SlNo",
      "Department Name",
      "Section Name",
      "Action"
    ],
    "tabs": null
  },
  {
    "route": "upload-employee",
    "group": "core-hr",
    "title": "Employee",
    "buttons": [
      "Excel Rules",
      "Upload"
    ],
    "columns": null,
    "tabs": null
  },
  {
    "route": "worker-directory",
    "group": "core-hr",
    "title": "Worker Directory",
    "buttons": [
      "Cards",
      "Org Chart"
    ],
    "columns": null,
    "tabs": null
  },
  {
    "route": "ess",
    "group": "ess",
    "title": "My Workspace",
    "buttons": [
      "Apply Leave",
      "My Attendance",
      "Payslips"
    ],
    "columns": null,
    "tabs": null,
    "lazy": true
  },
  {
    "route": "ess/attendance",
    "group": "ess",
    "title": "My Attendance",
    "buttons": [
      "Regularize",
      "Raise OT"
    ],
    "columns": [
      "Date",
      "Entry",
      "Exit",
      "Worked (min)",
      "OT (min)",
      "Status"
    ],
    "tabs": null
  },
  {
    "route": "ess/documents",
    "group": "ess",
    "title": "My Documents",
    "buttons": [
      "Upload"
    ],
    "columns": [
      "Type",
      "Number",
      "Category",
      "Expiry",
      "Status"
    ],
    "tabs": null
  },
  {
    "route": "ess/leave",
    "group": "ess",
    "title": "My Leave",
    "buttons": [
      "Submit Request"
    ],
    "columns": [
      "Leave Type",
      "Balance",
      "Reserved",
      "Available"
    ],
    "tabs": null
  },
  {
    "route": "ess/letters",
    "group": "ess",
    "title": "My Letters & Certificates",
    "buttons": [],
    "columns": [
      "Letter",
      "Type",
      "Issued",
      "Acknowledged"
    ],
    "tabs": null
  },
  {
    "route": "ess/locations",
    "group": "ess",
    "title": "My Work Locations",
    "buttons": [
      "Use my location",
      "Submit for approval"
    ],
    "columns": [
      "Sl.No",
      "Name",
      "Lat",
      "Long",
      "Radius",
      "Status"
    ],
    "tabs": null
  },
  {
    "route": "ess/payslips",
    "group": "ess",
    "title": "My Pay",
    "buttons": [],
    "columns": [
      "Period",
      "Basic",
      "Deductions",
      "Net",
      "Payable",
      "Paid"
    ],
    "tabs": null
  },
  {
    "route": "ess/probation",
    "group": "ess",
    "title": "My Probation",
    "buttons": [],
    "columns": null,
    "tabs": null,
    "lazy": true
  },
  {
    "route": "ess/profile",
    "group": "ess",
    "title": "My Profile",
    "buttons": [
      "Submit Change Request",
      "View My Requests"
    ],
    "columns": null,
    "tabs": null,
    "lazy": true
  },
  {
    "route": "ess/requests",
    "group": "ess",
    "title": "My Requests",
    "buttons": [],
    "columns": null,
    "tabs": null
  },
  {
    "route": "my-handover",
    "group": "ess",
    "title": "My Duty Handover",
    "buttons": [
      "Save"
    ],
    "columns": [
      "#",
      "Assignee",
      "From",
      "To",
      "Covers",
      "Active",
      "Action"
    ],
    "tabs": null
  },
  {
    "route": "absence-analytics",
    "group": "leave",
    "title": "Absence Analytics",
    "buttons": [
      "Filter",
      "Export"
    ],
    "columns": [
      "SL No",
      "Employee",
      "Department",
      "Spells (S)",
      "Days (D)",
      "Score (S²·D)",
      "Signal"
    ],
    "tabs": null
  },
  {
    "route": "comp-off-management",
    "group": "leave",
    "title": "Comp-Off Management",
    "buttons": [],
    "columns": [
      "SlNo",
      "Employee",
      "Earned",
      "Source",
      "Days",
      "Expiry",
      "Status",
      "Action"
    ],
    "tabs": null
  },
  {
    "route": "comp-offs",
    "group": "leave",
    "title": "Comp-Off",
    "buttons": [
      "Request Comp-Off"
    ],
    "columns": [
      "Earned",
      "Source",
      "Days",
      "Expiry",
      "Status",
      "Action"
    ],
    "tabs": null
  },
  {
    "route": "employee-handover",
    "group": "leave",
    "title": "Employee Duty Handover",
    "buttons": [
      "Save"
    ],
    "columns": [
      "#",
      "From",
      "To",
      "From Date",
      "To Date",
      "Covers",
      "Active",
      "Action"
    ],
    "tabs": null
  },
  {
    "route": "holiday-assignment-list",
    "group": "leave",
    "title": "Holiday Assignment",
    "buttons": [
      "Filter",
      "New Holiday Assignment"
    ],
    "columns": [
      "Sl.No",
      "Assignment Type",
      "Assigned Target Name",
      "Action"
    ],
    "tabs": null
  },
  {
    "route": "holiday-list",
    "group": "leave",
    "title": "Holiday",
    "buttons": [
      "Calendar",
      "Export",
      "New Holiday"
    ],
    "columns": [
      "Sl.No",
      "Holiday Name",
      "Dates",
      "Calendar",
      "Action"
    ],
    "tabs": null
  },
  {
    "route": "leave-approval",
    "group": "leave",
    "title": "Leave Approval",
    "buttons": [
      "Delegate approvals",
      "Filter",
      "Approve Selected",
      "Reject Selected"
    ],
    "columns": [
      "SL.No",
      "Employee Name",
      "Leave Type",
      "Details",
      "Leave Status",
      "Action"
    ],
    "tabs": null
  },
  {
    "route": "leave-assignment-list",
    "group": "leave",
    "title": "Leave Assignment",
    "buttons": [
      "Filter",
      "New Leave Assignment"
    ],
    "columns": [
      "Sl.No",
      "Assignment Type",
      "Assignment Target Name",
      "Leave Pattern",
      "Action"
    ],
    "tabs": null
  },
  {
    "route": "leave-attendance-sync",
    "group": "leave",
    "title": "Leave ↔ Attendance Sync",
    "buttons": [
      "Filter",
      "Recalculate period"
    ],
    "columns": [
      "Leave Ref",
      "Employee",
      "Dates",
      "Attendance rows",
      "LOP",
      "Sync status"
    ],
    "tabs": null
  },
  {
    "route": "leave-balances",
    "group": "leave",
    "title": "My Leave Balance",
    "buttons": [
      "Run Accrual"
    ],
    "columns": [
      "Sl.No",
      "Leave Type",
      "Opening",
      "Accrued",
      "Carried Fwd",
      "Used",
      "Encashed",
      "Reserved",
      "Available",
      "Liability"
    ],
    "tabs": null
  },
  {
    "route": "leave-calendar",
    "group": "leave",
    "title": "Leave Calendar",
    "buttons": [],
    "columns": null,
    "tabs": null
  },
  {
    "route": "leave-delegation",
    "group": "leave",
    "title": "Leave Approval Delegation",
    "buttons": [],
    "columns": [
      "SlNo",
      "From",
      "To",
      "From Date",
      "To Date",
      "Active",
      "Action"
    ],
    "tabs": null
  },
  {
    "route": "leave-encashment",
    "group": "leave",
    "title": "Leave Encashment",
    "buttons": [
      "Submit Request"
    ],
    "columns": [
      "SlNo",
      "Leave Type",
      "Days",
      "Amount",
      "Status"
    ],
    "tabs": null
  },
  {
    "route": "leave-encashment-approval",
    "group": "leave",
    "title": "Encashment Approvals",
    "buttons": [
      "Filter"
    ],
    "columns": [
      "SlNo",
      "Employee",
      "Leave Type",
      "Days",
      "Amount",
      "Status",
      "Action"
    ],
    "tabs": null
  },
  {
    "route": "leave-ledger",
    "group": "leave",
    "title": "Leave Ledger",
    "buttons": [
      "Filter",
      "Export"
    ],
    "columns": [
      "Date",
      "Employee",
      "Leave Type",
      "Txn",
      "Days",
      "Source Ref",
      "Balance after",
      "Posted by"
    ],
    "tabs": null
  },
  {
    "route": "leave-patterns",
    "group": "leave",
    "title": "Leave Patterns",
    "buttons": [
      "New Leave Pattern"
    ],
    "columns": [
      "Sl.No",
      "Leave Pattern Name",
      "Details",
      "Action"
    ],
    "tabs": null
  },
  {
    "route": "leave-policy",
    "group": "leave",
    "title": "Leave Policy Configuration",
    "buttons": [],
    "columns": null,
    "tabs": null
  },
  {
    "route": "leave-reports",
    "group": "leave",
    "title": "Leave Reports",
    "buttons": [
      "Register",
      "Balance",
      "Utilization",
      "Filter"
    ],
    "columns": null,
    "tabs": null
  },
  {
    "route": "leave-request-list",
    "group": "leave",
    "title": "Leave Request",
    "buttons": [
      "New Leave Request"
    ],
    "columns": [
      "Sl.No",
      "Leave Type",
      "Start Date",
      "End Date",
      "Approval Status",
      "Remarks",
      "Action"
    ],
    "tabs": null
  },
  {
    "route": "leave-types",
    "group": "leave",
    "title": "Leave Types",
    "buttons": [
      "Save"
    ],
    "columns": [
      "SlNo",
      "Leave Type Name",
      "Is Support Half Day",
      "Is Need Document",
      "Action"
    ],
    "tabs": null
  },
  {
    "route": "my-leave-policy",
    "group": "leave",
    "title": "My Leave Policy",
    "buttons": [],
    "columns": null,
    "tabs": null
  },
  {
    "route": "assessment-list",
    "group": "recruitment",
    "title": "Assessments",
    "buttons": [
      "New Assessment"
    ],
    "columns": [
      "Sl.No",
      "Title",
      "Type",
      "Description",
      "Max Score",
      "Attachment",
      "Action"
    ],
    "tabs": null
  },
  {
    "route": "candidate-status",
    "group": "recruitment",
    "title": "Candidate Status",
    "buttons": [
      "Add Followup Status"
    ],
    "columns": [
      "Sl No",
      "Status Name",
      "Nature",
      "Action"
    ],
    "tabs": null
  },
  {
    "route": "candidates",
    "group": "recruitment",
    "title": "Candidates",
    "buttons": [
      "Add New",
      "New",
      "In Progress",
      "Shortlisted"
    ],
    "columns": [
      "Sl.No",
      "Name",
      "Email",
      "Phone",
      "Branch",
      "Designation",
      "Skills",
      "Status",
      "Added On",
      "Action"
    ],
    "tabs": [
      "New",
      "In Progress",
      "Shortlisted",
      "Selected",
      "Rejected"
    ]
  },
  {
    "route": "communication-templates",
    "group": "recruitment",
    "title": "Candidate Communication",
    "buttons": [
      "New Template"
    ],
    "columns": [
      "Sl.No",
      "Name",
      "Type",
      "Subject",
      "Action"
    ],
    "tabs": null
  },
  {
    "route": "current-openings",
    "group": "recruitment",
    "title": "Join Our Team",
    "buttons": [],
    "columns": null,
    "tabs": null
  },
  {
    "route": "interview-rounds",
    "group": "recruitment",
    "title": "Interview Rounds",
    "buttons": [
      "Add Round"
    ],
    "columns": [
      "Sl No",
      "Round Name",
      "Order",
      "Action"
    ],
    "tabs": null
  },
  {
    "route": "interview-schedules",
    "group": "recruitment",
    "title": "Interviews",
    "buttons": [
      "Schedule Interview"
    ],
    "columns": [
      "Sl.No",
      "Candidate",
      "Round",
      "Scheduled On",
      "Mode",
      "Status",
      "Action"
    ],
    "tabs": null
  },
  {
    "route": "job-applications-list",
    "group": "recruitment",
    "title": "Job Applications",
    "buttons": [],
    "columns": [
      "Sl.No",
      "Name",
      "Position Applied For",
      "Phone",
      "Email",
      "Details",
      "Status",
      "Schedule Interview",
      "Reject"
    ],
    "tabs": null
  },
  {
    "route": "offer-list",
    "group": "recruitment",
    "title": "Offers",
    "buttons": [
      "New Offer"
    ],
    "columns": [
      "Sl.No",
      "Candidate",
      "Total CTC",
      "Joining",
      "Status",
      "Action"
    ],
    "tabs": null
  },
  {
    "route": "onboarding-pipeline",
    "group": "recruitment",
    "title": "Onboarding Pipeline",
    "buttons": [
      "Start Onboarding"
    ],
    "columns": null,
    "tabs": null
  },
  {
    "route": "onboarding-templates",
    "group": "recruitment",
    "title": "Onboarding Templates",
    "buttons": [
      "New Template"
    ],
    "columns": null,
    "tabs": null
  },
  {
    "route": "recruitment-pipeline",
    "group": "recruitment",
    "title": "Recruitment Pipeline",
    "buttons": [
      "Configure Stages",
      "Score"
    ],
    "columns": null,
    "tabs": null
  },
  {
    "route": "requisition-list",
    "group": "recruitment",
    "title": "Job Requisitions",
    "buttons": [
      "New Requisition"
    ],
    "columns": [
      "Sl.No",
      "Designation",
      "Department",
      "Positions",
      "Type",
      "Work Type",
      "Status",
      "Branch",
      "Action"
    ],
    "tabs": null
  },
  {
    "route": "talent-pool",
    "group": "recruitment",
    "title": "Talent Pool",
    "buttons": [],
    "columns": [
      "Sl.No",
      "Name",
      "Designation",
      "Skills",
      "Tags",
      "Status",
      "Score",
      "Action"
    ],
    "tabs": null
  },
  {
    "route": "vacancy-list",
    "group": "recruitment",
    "title": "Hiring",
    "buttons": [
      "Add Job Opening"
    ],
    "columns": [
      "Candidates",
      "Job Opening",
      "Hiring Lead",
      "Created On",
      "Status",
      "Action"
    ],
    "tabs": [
      "Job Openings",
      "Candidates",
      "Talent Pools"
    ]
  }
];
