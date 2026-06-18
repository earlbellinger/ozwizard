/*  MultReg.c - port to S_Tran interpreter - 5/2004 - rfs  */        
/*  $Id: creglib.c,v 2.0 2001/01/16 20:39:14 rfs Exp rfs $  */

/*============================================================*
 *    S_TRAN - Copyright (c) 2005, Stellingwerf Consulting    *
 *    All rights reserved, Use under license agreement only.  *
 *============================================================*/

/*  creglib.c  -  CDAT multiple regression library routines -- 4/84 */
/*  qnx4/windows version - 12/93  */
/*  ported to "S" - rfs - 5/04  */

#define EXTERN extern
#include "s_tran.h"

#define  NEMX    10000
#define  NAMX    100
#define  NVAR    30
#define  FBIG    1.e38
#define  F_LEV     2.5       /*  F values for entering or dropping a variable  */
#define  TOL     1.e-6       /*  minimum size of a diagonal element  */

int mr_args, nat[NAMX+1];
double tol1, tol2, tol3;
static int num;
double xx[MAX_LINES+1][MAX_FIELDS+1], coeffs[NAMX+1];
char Labels[MAX_FIELDS+1][FIELD_LEN+1];

int ne, na;

/*----------data reader for statistics package - .csv files --------------------*/

int read_csv_data_3( char *file, char labels[MAX_FIELDS+1][FIELD_LEN+1] )
{
    int i, j, ret, rows=0, cols=0;
    char buffer[LINE_LEN+1];
    static FILE *fp;
    char csv_file[LINE_LEN+1];

    if( fp )  fclose( fp );
    if( file[0] != '\\' && file[1] != ':' )  sprintf( csv_file, "%s%s", path_name, file );
    else  strcpy( csv_file, file );
    fp = fopen( csv_file, "r" );
    if( !fp ) {
        sprintf( stmp, "Cannot open data file <%s>", csv_file );
        do_error( stmp );
    }
    else printf( "Reading data from file %s\n", csv_file );

    ret = fgetstr( fp, buffer, LINE_LEN );

    if( ret == -1 ) {
        do_error( "Empty data file\n" );
        return(0);
    }

    /*  read label line, set number of rows  */
    for( i = 1; i <= MAX_FIELDS; i++ ) {
        ret = item_dat( i, labels[i], FIELD_LEN, buffer, LINE_LEN );
        if( !ret )  do_error( "read_reg_file: max fields exceeded" );
        else if( ret < 0 ) {
            na = rows = i - 1;
            sprintf( stmp, "%d", rows );
            printf( "    %d columns found\n", na );
            register_user_var( "M", stmp, 0 );
            break;
        }
        else {
            sprintf( stmp, "$Label[%d]", i );
            register_user_var( stmp, labels[i], 0 );
            strcpy( Labels[i], labels[i] );
        }
    }

    /*  read data  */
    for( i = 1; i <= MAX_LINES; i++ ) {
        ret = fgetstr( fp, buffer, LINE_LEN );
        
        /*  eof handler  */
        if( ret == -1 ) {
            fclose( fp );
            fp = NULL;
            ne = cols = i - 1;
            sprintf( stmp, "%d", cols );
            printf( "    %d rows found\n\n", ne );
            register_user_var( "N", stmp, 0 );
            return(0);
        }
        
        for( j = 1; j <= rows; j++ ) {
            ret = item_dat( j, labels[j], FIELD_LEN, buffer, LINE_LEN );
            if( ret <= 0 )  do_error( "read_dat_2:  unable to process data" );
            sprintf( stmp, "X[%d][%d]", i, j );
            register_user_var( stmp, labels[j], 0 );
                                                /*  missing data  */
            if( labels[j][0] == '\0' )  xx[i][j] = MISS;
            else  xx[i][j] = exptof( labels[j] );
        }
    }
    return(1);
}


/*---------------- called if no file is specified  */

int set_stat_data( )
{
    int i, j;
    double tmp;

    i = exptoi( "N" );
    if( !i )  do_error( "Mult Regress:  N = 0" );
    else      ne = i;

    i = exptoi( "M" );
    if( !i )  do_error( "Mult Regress:  M = 0" );
    else      na = i;

    for( i = 1; i <= na; i++ ) {
        sprintf( stmp, "$Labels[%d]", i );
        lookup_user_var( stmp );
        strcpy( Labels[i], gstring );
    }
    for( i = 1; i <= ne; i++ ) {
        for( j = 1; j <= na; j++ ) {
            sprintf( stmp, "X[%d][%d]", i, j );
            tmp = exptof( stmp );
            xx[i][j] = tmp;
        }
    }
    return(1);
}


/*----------------- return double value( i, j )  */

double fv( int i, int j, int rlog )
{
    double v;

    if( rlog )    v = logc( xx[i][j] );
    else          v =  xx[i][j];

    if( v == MISS )  {
        sprintf( stmp, "ERROR:  data value( %d, %d ) is missing", i, j );
        do_error( stmp );
    }
    return( v );
}


/*---------------stepwise multiple regression - ported from cdat -----------------------*/

int mult_regress( void )
{
    int i, j, k, ny, nx[NVAR+1], n, m, phi, nmin, nmax, step, termi;
    double f1, f2, sig[NVAR+1], a[NVAR+1][NVAR+1], b[NVAR+1], sb[NVAR+1], sdev[NVAR+1], xbar[NVAR+1];
    double sy, sy0=0., sym, vi, vmin, vmax, tol, b0=0., sb0, f3, akk;
    static int rlogx, rlogy;

    if( reglog == LOGLOG || reglog == LOGLIN )  rlogx = TRUE;
    else                                        rlogx = FALSE;
    if( reglog == LOGLOG || reglog == LINLOG )  rlogy = TRUE;
    else                                        rlogy = FALSE;

    /*  trial setup--------  */

    if( mr_args ) {
        na = mr_args;
        for( i = 1; i <= na-1; i++ ) {
            nx[i] = nat[i];               /*  x vars  */
        }
    }
    else {
        for( i = 1; i <= na-1; i++ ) {
            nx[i] = i+1;                  /*  x vars  */
        }
        nat[0] = 1;                       /*  y var   */
    }

    m = ne;                               /*  number of data points  */
    n = na-1;                             /*  number of x variables  */

    ny = nat[0];                          /*  y var   */

    if( n > NVAR ) {
        n = NVAR;
        fprintf( stderr, "**** # variables set to max = %d\n", n );
    }
                                                /*  initializations  */
    if( tol1 ) {
        f1 = tol1;
        f2 = tol2;
        if( tol2 > tol1 )  printf( "\n--->WARNING: F(enter) < F(drop), could be unstable\n\n" );
        tol = tol3;
    }
    else {
        f1 = F_LEV;
        f2 = f1 - 0.10;
        tol = TOL;
    }
    n = n + 1;
    nx[n] = ny;
                                                /*  header  */

    printf( "* STEPWISE MULTIPLE REGRESSION ANALYSIS *\n\n" );
    
    if( rlogx && rlogy )  printf( "LOG/LOG (POWER LAW) ANALYSIS:\n" );
    if( rlogx && !rlogy )  printf( "LOG/LIN (EXP) ANALYSIS:\n" );
    if( !rlogx && rlogy )  printf( "LIN/LOG (LOG) ANALYSIS:\n" );
    printf( "\tDependent (Y) Variable =\n" );
    printf( "\t\t%d.  %s\n", ny, Labels[ny] ); 
    
    printf( "\tIndependent (X) Variable(s) =\n" ); 
    for( i = 1; i < n; i++ ) {
        printf( "\t\t%d.  %s\n", nx[i], Labels[nx[i]] );
    }
    printf( "\n# variables = %d,   # data = %d\n", n, m );
    printf( "Degrees of freedom = %d, %d - # steps\n", m - 1, m - 1 );
    printf( "F level to enter new variable = %g, to remove = %g\n",f1,f2);

                                                /*  compute means  */
    for( j = 1; j <= n; j++ ) {
        xbar[j] = 0.;
        for( i = 1; i <= m; i++ ) {
            xbar[j] += fv( i, nx[j], j==n ? rlogy : rlogx );
        }
        xbar[j] /= m;
    }
                                                /*  cross products  */    
    for( k = 1; k <= n; k++ ) {
        for( j = k; j <= n; j++ ) {
            a[k][j] = 0.;
            for( i = 1; i <= m; i++ ) {
                a[k][j] = a[k][j] + fv( i, nx[k], k==n ? rlogy : rlogx  ) * fv( i, nx[j], j==n ? rlogy : rlogx );
            }
        }
    }
    for( i = 1; i <= n; i++ ) {                 /*  residual cross products  */    
        for( j = i; j <= n; j++ ) {
            a[i][j] -= xbar[i] * xbar[j] * m;
        }
    }
    for( i = 1; i <= n; i++ ) {                 /*  sigmas  */    
        if( a[i][i] < 0. )  a[i][i] = 0.;
        sig[i] = sqrt( a[i][i] );
    }

    for( i = 1; i <= n - 1; i++ ) {             /*     correlation coeffs  */
        for( j = i + 1; j <= n; j++ ) {
            if( sig[i]*sig[j] )  a[i][j] /= (sig[i] * sig[j]);
            else                 a[i][j] = 0.;
            a[j][i] =  a[i][j];
        }
    }
    printf( "\nCorrelation Coefficients:\n" );
    for( i = 1; i <= n; i++ ) {
        printf( "\n" );
        for( j = i + 1; j <= n; j++ ) {
            printf( "\tr(%d,%d) = %g\n", nx[i], nx[j], a[i][j] );
        }
    } 

    for( i = 1; i <= n; i++ ) {
		a[i][i] = 1.;
	}
    if( !rlogx && !rlogy )  printf( "\nBEGIN LINEAR ANALYSIS\n\n" );
    if( !rlogx && rlogy )  printf( "\nBEGIN EXPONENTIAL ANALYSIS\n\n" );
    if( rlogx && !rlogy )  printf( "\nBEGIN LOGARITHMIC ANALYSIS\n\n" );
    if( rlogx && rlogy )  printf( "\nBEGIN POWER LAW ANALYSIS\n\n" );
    k = 0;
    phi = m - 1;
    sy = 1.;

    for( step = 1; step <= m - 1 ; step ++ ) {        /*  begin main loop  */

        for( j = 1; j <= n-1; j++ )  b[j] = 0.;
        sym = sy;
        if( phi && a[n][n] > 0.)  sy = sig[n] * sqrt( a[n][n]/phi );
        else sy = 0.;
        if( step == 1 )  sy0 = sy;
        printf( "\tStandard Deviation of Y = %g (%.3g%%)", sy, 100 * sy / sy0 );
        if( step > 1 ) {
            printf( ", R^2 = %g\n", 1.-a[n][n] );
            printf( "\tVariance reduced by %.2f%% this step\n", 100*( (sq( sym ) - sq( sy)) / sq( sy0 ) ) );

        }
        else  printf( "\n" );

        vmin = FBIG/NVAR;
        vmax = 0.;
        nmin = nmax = 0;
        num = 1;
        nat[0] = nat[1] = ny;
        coeffs[1] = 1.;
        for( i = 1; i <= n - 1; i++ ) {                    /*  survey variables */
            if( fabs( a[i][i] ) <= tol )  continue;
            vi = a[i][n]*a[n][i]/a[i][i];
            if( vi >= 0. ) {
                if( vi > vmax ) {
                    vmax = vi;
                    nmax = i;
                }
                continue;
            }
            else {                                        /*  compute bi's  */
                if( sig[i] ) {
                    b[i] = a[i][n]*sig[n]/sig[i];
                    sb[i] = sy*sqrt( a[i][i] )/sig[i];
                    printf( "\t\tb(%d) = %g +- %g\n", nx[i], b[i], sb[i] );
                }
                else {
                    b[i] = 0.;
                    sb[i] = 0.;
                    printf( "\t\tb(%d) = %g +- %g\n", nx[i], b[i], sb[i] );
                }
                if( fabs( vi ) < fabs( vmin ) ) {
                    vmin = vi;
                    nmin = i;
                }
                num++;
                nat[num] =  nx[i];
                coeffs[num] = b[i];
                sdev[num] = sb[i];
            }
        }
        b0 = xbar[n];                                    /*  compute constant */
        for( i = 1; i <= n-1; i++ ) {
            b0 = b0 - b[i]*xbar[i];
        }
        if( a[n][n] > 0. )  sb0 = sy * sqrt( a[n][n] * (m-1) / (m-step) );
        else                sb0 = 0.;
        if( k != 0 )  {
            printf( "\t\tb0 = %g +- %g\n", b0, sb0 );
        }
        coeffs[0] = b0;
                                                        /*  display equation  */
        if( step > 1 ) {
            printf( "  Fit: %s = ", Labels[ny] );
            termi = 0;
            if( rlogx && rlogy ) {
                printf( "%g", exp( b0 ) );
                for( i = 1; i < n; i++ ) {
                    if( b[i] ) {
                        termi++;
                        printf( " * " );
                        printf( "%s^%.2f", Labels[nx[i]], b[i] );
                    }
                }
                printf( "\n" ); 
            }
            else if( rlogy && !rlogx ) {
                printf( "%g", exp( b0 ) );
                for( i = 1; i < n; i++ ) {
                    if( b[i] ) {
                        termi++;
                        printf( " * " );
                        printf( "exp(%g*%s)", b[i], Labels[nx[i]] );
                    }
                }
                printf( "\n" ); 
            }
            else if( rlogx && !rlogy ) {
                for( i = 1; i < n; i++ ) {
                    if( b[i] ) {
                        termi++;
                        if( termi == 1 )      printf(   " %g*ln(%s)",  b[i], Labels[nx[i]] );
                        else if( b[i] > 0. )  printf( " + %g*ln(%s)",  b[i], Labels[nx[i]] );
                        else if( b[i] < 0. )  printf( " - %g*ln(%s)", -b[i], Labels[nx[i]] );
                    }
                }
                if( b0 > 0. )  printf( " + %g\n", b0 );
                else if( b0 < 0. )  printf( " - %g\n", -b0 );
            }
            else {
                for( i = 1; i < n; i++ ) {
                    if( b[i] ) {
                        termi++;
                        if( termi == 1 )      printf(   " %g*%s",  b[i], Labels[nx[i]] );
                        else if( b[i] > 0. )  printf( " + %g*%s",  b[i], Labels[nx[i]] );
                        else if( b[i] < 0. )  printf( " - %g*%s", -b[i], Labels[nx[i]] );
                    }
                }
                if( b0 > 0. )  printf( " + %g\n", b0 );
                else if( b0 < 0. )  printf( " - %g\n", -b0 );
            }
        }
        
        if( a[n][n] <= 0. )  break;                     /*  degeneracy tests */
        if( vmax >= a[n][n] ) vmax = a[n][n] - 1.e-10;

        f3 = fabs( vmin )*phi/a[n][n];                  /*  remove variable  */ 
        if( f3 < f2 ) {                    
            k = nmin;
            phi = phi + 1;
            
            printf( "\nStep Number %d\n", step);
            if( rlogx ) sprintf( stmp, "log %s", Labels[nx[k]] );
            else      sprintf( stmp, "%s", Labels[nx[k]] );
            printf( "\tREMOVING VARIABLE %d: %s\n", nx[k], stmp );
            printf( "\tF level = %g\n", f3 ); 
        }
                                                        /*  enter variable  */
        else if( (f3 = vmax*(phi - 1)/(a[n][n] - vmax)) > f1 ) {
            k = nmax;
            phi = phi - 1;
            
            printf( "\nStep Number %d\n", step);
            if( rlogx ) sprintf( stmp, "log %s", Labels[nx[k]] );
            else      sprintf( stmp, "%s", Labels[nx[k]] );
            printf( "\tENTERING VARIABLE %d: %s\n", nx[k], stmp );
            printf( "\tF level = %g\n", f3 );
        }
        else  break;                                      /*  done   */
   
        akk = a[k][k];                                  /*  new matrix  */ 
        for( i = 1; i <= n; i++ ) {
            for( j = 1; j <= n; j++ ) {
                if( i == k || j == k )  continue;
                   a[i][j] -= a[i][k]*a[k][j]/akk;
            }
        }
        for( i = 1; i <= n; i++ ) {
            a[i][k] /= (-1.*akk);
        }
        for( j = 1; j <= n; j++ ) {
            a[k][j] /= akk;
        }
        a[k][k] = 1./akk;
    }
    printf( "\nNo further significant correlations.\n" );

    /*  store the results  */

    sprintf( stmp, "%.14e", b0 );
    register_user_var( "B0", stmp, 0 );

    sprintf( stmp, "%d", num-1 );
    register_user_var( "NVars", stmp, 0 );

    sprintf( stmp, "%.14e", sy );
    register_user_var( "SY", stmp, 0 );

    for( i = 1; i <= num-1; i++ ) {

        sprintf( stmp, "Vars[%d]", i );
        sprintf( Labels[0], "%d", nat[i+1] );
        register_user_var( stmp, Labels[0], 0 );

        sprintf( stmp, "Coeffs[%d]", i );
        sprintf( Labels[0], "%.14e", coeffs[i+1] );
        register_user_var( stmp, Labels[0], 0 );

        sprintf( stmp, "SB[%d]", i );
        sprintf( Labels[0], "%.14e", sdev[i+1] );
        register_user_var( stmp, Labels[0], 0 );
    }
    mr_args = 0;
    return( 1 );
}
