namespace sprint;
 
using { cuid } from '@sap/cds/common';
 
using {sprint.common as common} from './common';

// Master Data : Clients, Departments, Employees
context master {
 
    entity Clients : cuid {
 
        clientName      : common.string100 @assert.unique;
        contactPerson   : common.string100;
        email           : common.string100 @assert.unique;
        phoneNo         : common.string20;
        address         : common.string255;
        country         : common.string20;
        industry        : common.string50;
        status          : common.ClientStatus;
        projects : Association to many ProjectManagement.Projects
            on projects.client = $self;
    }
 
    entity Departments : cuid {
 
        departmentName   : common.string60 @assert.unique;
        description      : String(255);
        status           : common.DepartmentStatus;
        employees : Association to many Employees
            on employees.department = $self; 
    }
 
    entity Employees : cuid{
 
        //employeeNumber   : String(20) @assert.unique;
 
        firstName        : common.string60;
        lastName         : common.string60;
        email            : common.string100 @assert.unique;
        phoneNo          : common.string20;
        jobTitle         : String(60);
        role             : common.EmployeeRole;
        department       : Association to Departments;
        reportingManager : Association to Employees;
        joinDate         : Date;
        hourlyRate       : Decimal(15,2);
        status           : common.EmployeeStatus;
        timesheets : Association to many TimeManagement.Timesheets
            on timesheets.employee = $self;
 
        approvedTimesheets : Association to many TimeManagement.Timesheets
            on approvedTimesheets.approvedBy = $self;
 
        managedProjects : Association to many ProjectManagement.Projects
            on managedProjects.manager = $self;
 
        assignedTasks : Association to many ProjectManagement.Tasks
            on assignedTasks.assignedTo = $self;
    }
}
 
 
// PROJECT MANAGEMENT
 
context ProjectManagement {
 
    entity Projects : cuid{
 
        client          : Association to master.Clients;
        manager         : Association to master.Employees;
        projectCode     : common.string20 @assert.unique;
        projectName     : common.string100;
        description     : common.String500;
        billingType     : common.BillingType;
        startDate       : Date;
        endDate         : Date;
        status          : common.ProjectStatus;
        priority        : common.PriorityType;
        plannedHours    : Decimal(10,2);
        consumedHours   : Decimal(10,2);
        budget : Association to one Budgets on budget.project = $self; // back link only no foreign key stored on project
        milestones : Association to many Milestones
            on milestones.project = $self;
        invoices : Association to many billing.Invoices
            on invoices.project = $self;
    }
 
    entity Budgets : cuid {
 
        project         : Association to one Projects @assert.unique;
        budgetAmt       : Decimal(15,2);
        consumedAmt     : Decimal(15,2);
        remainingAmt    : Decimal(15,2);
        billingRateHr   : Decimal(15,2);
        currencyCode    : common.string3;
        status          : common.BudgetStatus;
    }
 
    entity Milestones : cuid {
 
        project             : Association to Projects;
        milestoneName       : common.string100; 
        startDate           : Date;
        endDate             : Date;
        completionPercent   : Decimal(5,2);
        priority            : common.PriorityType;
        status              : common.MilestoneStatus;
        tasks : Association to many Tasks
            on tasks.milestone = $self;
    }
 
    entity Tasks : cuid {
 
        milestone       : Association to Milestones;
        taskName        : common.string100;
        description     : common.String500;
        startDate       : Date;
        endDate         : Date;
        priority        : common.PriorityType;
        status          : common.TaskStatus;
        estimatedHours  : Decimal(10,2);
        actualHours     : Decimal(10,2);
        assignedTo      : Association to master.Employees;
        entries : Association to many TimeManagement.TimesheetEntries
            on entries.task = $self;
    }
}
 
 
// TIMESHEET
 
context TimeManagement {
 
    entity Timesheets : cuid {
        employee            : Association to master.Employees;
        approvedBy          : Association to master.Employees;
        invoice             : Association to billing.Invoices;
        weekStartDate       : Date;
        weekEndDate         : Date;
        totalBillableHours  : Decimal(10,2);
        submittedDate       : Date;
        approvedDate        : Date;
        rejectionReason     : common.string255;
        status              : common.TimesheetStatus;
        entries : Association to many TimesheetEntries
            on entries.timesheet = $self;
    }
 
    entity TimesheetEntries : cuid {
 
        timesheet       : Association to Timesheets;
        task            : Association to ProjectManagement.Tasks;
        workDate        : Date;
        hours           : Decimal(4,2);
        isBillable      : Boolean default true;
        notes           : common.string255;
    }
}
 
 
// BILLING
 
context billing {
 
    entity Invoices : cuid{
 
        invoiceNumber  : String(30) @assert.unique;
        project        : Association to ProjectManagement.Projects;
        invoiceDate    : Date;
        dueDate        : Date;
        billableHours  : Decimal(10,2);
        totalAmt       : Decimal(15,2);
        taxAmt         : Decimal(15,2);
        currencyCode   : common.string3;
        status         : common.InvoiceStatus;
        timesheets : Association to many TimeManagement.Timesheets
            on timesheets.invoice = $self;
    }
}