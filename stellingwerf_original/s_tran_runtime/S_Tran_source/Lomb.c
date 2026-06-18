/*  lomb.c - per analysis package  */
/* $Id: lomb.c,v 1.01 2004/7/15 01:19:42 rfs Exp rfs $  */

/*============================================================*
 *    S_TRAN - Copyright (c) 2005, Stellingwerf Consulting    *
 *    All rights reserved, Use under license agreement only.  *
 *============================================================*/

/*  Lomb method, adapted from Press, NRC  */
/*  ported by rfs - 7/2004  */

/*    Version 101201    */
/*  Includes Monte Carlo analysis for significance testing  */

#define EXTERN extern
#include "s_tran.h"

#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <stdio.h>
#include <ctype.h>

static double dophase( double tt, double t0, double f );
int p_sort( int n, double dat1[], double dat2[], double dat3[], int sgn );
int i_sort( int n, int dat1[], double dat2[], int sgn );
double table_interp( double x0, int n, double xt[], double yt[] );

static void avvr(double data[], unsigned long n, double *ave, double *var);
static void lomb_p(double x[], double y[], int n, double ofac, double hifac, double px[],
    double py[], int np, int *nout, int *jmax, double *prob);


#define TWOPID 6.2831853071795865
#define MAXDATL         2500
#define THMAX    100                    /*  bins in distribution   */
#define PWRMAX   12.                     /*  max power for dist plots  */

double y00[MAXDATL];
double pymax;


/*  defined in pdm, set in set_per_params  */
extern int lpoints;
extern double minf0, maxf0;
extern int invert_curve, pdm_verbose;
extern int do_non_par;                    /*  select nonparametric sig test          */
extern int nb0;                           /*  points in monte-carlo scan             */
extern int do_dist;                       /*  distributions  */

extern int theta_dist[], tot_points, tot_points2; /* numerical theta distribution     */
extern double dtheta[];                           /* theta values for dist            */
extern double theta_dist2[];                      /* theta_min distribution           */
extern int ran_array[];                           /* for Nemec significance test      */


int amp_units, psd_units;    /*  set to amplitude, rather than power  */

void lomb( int n, double x[], double y[] ) 
{
    double px[10*MAXDATL+1], py[10*MAXDATL+1], hifac, ofac, prob, phase;
    double tmp, tmp2, xmax, xmin, xdif, sig0, signf0, expy, effm;
    int i, ii, kk, nout, jmax, np, nf, nb, pdv;

    FILE *fp;

	nb = 1;

    /*  theta array for distributions  */
    for( i = 0; i <= THMAX; i++ )  dtheta[i] = PWRMAX*i/THMAX;


    /*--------------------monte-carlo sig option----------------------------*/
    
    if( do_non_par ) {
        printf("\n==========MONTE CARLO SIGNIFICANCE ANALYSIS============\n" );

        nb = nb0;
        for( i = 1; i <= n; i++ ) {
            y00[i] = y[i];
        }

        for( i = 0; i <= THMAX; i++ )  theta_dist2[i] = 0.;
        tot_points2 = 0;
        pdv = pdm_verbose;
        pdm_verbose = FALSE;
    }

    for( kk = 1; kk <= nb; kk++ ) {

        if( do_non_par ) {
            /*  set to original order  */
            for( i = 1; i <= n; i++ ) {
                y[i] = y00[i];
            }
            /*  final pass  */
            if( kk == nb ) {
                pdm_verbose = pdv;
            }
			else {
				/*  scramble the data set  */
				for( i = 1; i <= n; i++ ) {
					ran_array[i] = (int)(1.e8 * rnd());
				}
				i_sort( n, ran_array, y, 1 );
				printf( "   iteration %d / %d\r", kk, nb );
			}
        }

		
		p_sort( n, x, y, px, 1 );           /*  sort the data  */
		
		/*  write data file  */
		fp = fopen( "ldata.csv", "w" );
		if( invert_curve ) {
			fprintf( fp, "Time,-Val\n" );
			for( i = 1; i <= n; i++ ) {
				fprintf( fp, "%g,%g\n", x[i], -y[i] );
			}
		}
		else {
			fprintf( fp, "Time,Val\n" );
			for( i = 1; i <= n; i++ ) {
				fprintf( fp, "%g,%g\n", x[i], y[i] );
			}
		}
		fclose( fp );
		if( pdm_verbose)  printf( "Lomb data written to ldata.csv\n" );
		
		if( lpoints ) {
			ofac = lpoints;
		}
		else  {
			ofac = 3.;
		}
		hifac = 2.;
		
		minf0 = 0.;                 /*  for now  */
		if( maxf0 ) {
			xmax=xmin=x[1];
			for (i=1;i<=n;i++) {
				if (x[i] > xmax) xmax=x[i];
				if (x[i] < xmin) xmin=x[i];
			}
			xdif=xmax-xmin;
			hifac = 2. * (maxf0-minf0) * xdif / n;
			nf = (int)(0.5*n*hifac*ofac);
			if( !nf ) {
				printf( "LOMB error, number of frequencies = 0 = n(%d) * hifac(%g) * ofac(%g)\n", n, hifac, ofac );
				do_error( "" );
			}
			if( pdm_verbose)  printf( "Params: minf=%g, maxf=%g, ofac=%g, hifac=%g, nf=%d\n", minf0, maxf0, ofac, hifac, nf );
		}
		else {
			if( pdm_verbose)  printf( "WARNING: max f not set, defaults used, ofac=%g, nf=%d\n", ofac, (int)(0.5*n*hifac*ofac) );
		}
		
		np = 10*MAXDATL;            /*  array limit  */
		
		
		lomb_p(x, y, n, ofac, hifac, px, py, np, &nout, &jmax, &prob);        /*  do it  */


        /*  accumulate for extreme value distribution  */
        if( do_non_par ) {
            ii = (int)floor(pymax*THMAX/PWRMAX);
            ii = min( ii, THMAX );
            theta_dist2[ii] += 1.;
            tot_points2++;
        }

		if( pdm_verbose)  printf( "\n***LOMB***\n" );
		if( pdm_verbose)  printf( "\n    Best bet is freq=%g,  per=%g,  conf = %g\n\n", px[jmax], 1/px[jmax], prob );
		fp = fopen( "lombplot.csv", "w" );
		if( amp_units)  fprintf( fp, "Frequency,Amp\n" );
		else if( psd_units)  fprintf( fp, "Frequency,PSD\n" );
		else            fprintf( fp, "Frequency,Pwr\n" );
		
		//sprintf( stmp, "%d", nout );
		//register_user_var( "NHdat", stmp, 0 );

		for( i = 1; i <= nout; i++ ) {
			fprintf( fp, "%g,%g\n", px[i], py[i] );
			
			/*  register the results for program access  
			sprintf( stmp0, "Hdat[%d]", i );
			sprintf( stmp, "%g", py[i] );
			register_user_var( stmp0, stmp, 0 );
			
			  sprintf( stmp0, "Fdat[%d]", i );
			  sprintf( stmp, "%g", px[i] );
			  register_user_var( stmp0, stmp, 0 );
			*/
		}
		fclose( fp );
		if( pdm_verbose) printf( "Lomb results written to lombplot.csv\n" );
		/*  write out the best light curve  */
		fp = fopen( "lcurve.csv", "w" );
		if( invert_curve )  fprintf( fp, "Phase(F=%.4f)(P=%.4f)),-Val,Num\n", px[jmax], 1./px[jmax] );
		else fprintf( fp, "Phase(F=%.4f)(P=%.4f)),Val,Num\n", px[jmax], 1./px[jmax] );
		for( i = 1; i <= n; i++ ) {
			phase = dophase( x[i], x[1], px[jmax] );
			if( invert_curve )  tmp = -y[i];
			else                tmp = y[i];
			fprintf( fp, "%g,%g,%d\n", phase, tmp, i );
		}
		fclose( fp );
		
		/*---significance distribution tester------*/
		
		if( do_dist ) {
			fp = fopen( "sig.csv", "w" );
			fprintf( fp, "Power,Exp,Exp_bc\n" );
			for( i = 1; i <= 121; i++ ) {
				tmp = (i-1)/10.;
				
				expy = exp( -tmp );
				effm = 2.0 * nout / ofac;
				sig0 = expy;
				signf0 = effm*sig0;
				/*  apply bandwidth correction  */
				if( signf0 > 0.01) 
					signf0 = 1.0-pow( 1.0-expy, effm ) ;
				
				fprintf( fp, "%g,%g,%g\n", tmp, sig0, signf0 );
			}
			fclose( fp );
			if( pdm_verbose )  printf( "Exp distribution written to sig.csv\n" );
		}
	}
		
	/*  distribution plot  */
	if( do_dist ) {
		fp = fopen( "theta_dist.csv", "w" );
		if( !fp )  error( "Could not open theta_dist" );
		fprintf( fp, "Power,Dist,Dist_min\n" );
		tmp = 0.;
		tmp2 = 0.;
		for(i = THMAX; i >= 0; i-- ) {
			tmp += (double)theta_dist[i]/tot_points;
			if( do_non_par )  tmp2 += theta_dist2[i]/tot_points2;
			fprintf( fp, "%g,%g,%g\n", dtheta[i], tmp, tmp2 );
            theta_dist2[i] = tmp2;
		}
		fclose( fp );
		if( pdm_verbose ) {
			if( do_non_par ) {
	            printf( "\n %d data distributions analyzed\n   Monte Carlo Lomb power distributions are in theta_dist.csv\n", nb );
			}
			else {
                printf( "\nAnalytic Lomb power distributions are in theta_dist.csv\n" );
			}
		}

		if( do_non_par) {
		    prob = table_interp( pymax, THMAX, dtheta, theta_dist2 );
			if( pdm_verbose)  printf( "\nMaxP = %g, Monte Carlo significance = %g\n", pymax, prob );
		}
	}
		
}


/*  Based on Numerical Recipes - "period.c"  */

void lomb_p( double x[], double y[], int n, double ofac, double hifac, double px[],
    double py[], int np, int  *nout, int  *jmax, double  *prob )
{
    int i,j, ii;
    double ave, c, cc, cwtau, effm, expy, pnow, s, ss, sumc, sumcy, sums, sumsh,
        sumsy, swtau, var, wtau, xave, xdif, xmax, xmin, yy, pstep;
    double arg, wtemp;
    double wi[MAXDATL+1], wpi[MAXDATL+1], wpr[MAXDATL+1], wr[MAXDATL+1];
	double sumd2, sump2;

    *nout =  (int)(0.5 * ofac * hifac * n);
    if( *nout > np ) {
        if( pdm_verbose)  printf("output arrays too short in lomb_p, range shortened\n");
        *nout  =  np;
    }
    avvr( y, n, &ave, &var );
    xmax = xmin = x[1];
    for( j = 1; j<= n; j++ ) {
        if (x[j] > xmax) xmax = x[j];
        if (x[j] < xmin) xmin = x[j];
    }
    xdif = xmax - xmin;
    xave = 0.5 * (xmax + xmin);
    pymax = 0.0;
    pstep = 1.0 / (xdif * ofac);
    if( minf0 ) pnow = minf0;
    else        pnow = pstep;
    for( j = 1; j<= n; j++ ) {
        arg = TWOPID * ((x[j]-xave) * pstep);
        wpr[j] = -2.0 * sq( sin( 0.5 * arg ) );
        wpi[j] = sin( arg );
        wr[j] = cos( arg );
        wi[j] = wpi[j];
    }
	sumd2 = sump2 = 0;
    for (i = 1; i <= (*nout); i++) {
        px[i] = pnow;
        sumsh = sumc = 0.0;
        for( j = 1;j <= n;j++ ) {
            c = wr[j];
            s = wi[j];
            sumsh +=  s * c;
            sumc += (c-s) * (c+s);
        }
        wtau = 0.5 * atan2( 2.0 * sumsh,sumc );
        swtau = sin( wtau );
        cwtau = cos( wtau );
        sums = sumc = sumsy = sumcy = 0.0;
        for( j = 1; j <= n; j++ ) {
            s = wi[j];
            c = wr[j];
            ss = s * cwtau - c * swtau;
            cc = c * cwtau + s * swtau;
            sums +=  ss * ss;
            sumc +=  cc * cc;
            yy = y[j]-ave;
            sumsy +=  yy * ss;
            sumcy +=  yy * cc;
            wr[j] = ((wtemp = wr[j]) * wpr[j] - wi[j] * wpi[j]) + wr[j];
            wi[j] = (wi[j] * wpr[j] + wtemp * wpi[j]) + wi[j];
        }
        py[i] = 0.5 * (sumcy * sumcy / sumc + sumsy * sumsy / sums) / var;

		if( amp_units )  py[i] = 2 * sqrt( py[i] * var / n );           //  convert to amplitude
		if( psd_units )  py[i] = py[i] * sqrt(var/pstep) / 1.288;       //  convert to psd

		sumd2 += y[i]*y[i];
		sump2 += py[i]*py[i]/n;

        if( py[i] >=  pymax )  pymax = py[(*jmax = i)];
        pnow +=  pstep;
		
		/*  accumulate for distribution  */
		if( do_dist ) {
			ii = (int)floor(py[i]*THMAX/PWRMAX);
			ii = min( ii, THMAX );
			theta_dist[ii]++;
			tot_points++;
		}	
    }
    expy = exp( -pymax );
    effm = 2.0 * (*nout) / ofac;
    *prob = effm * expy;
    if( *prob > 0.01)  *prob = 1.0-pow( 1.0-expy, effm ) ;
	
	if( pdm_verbose)  printf( "Units:  amp = %d   psd = %d\n", amp_units, psd_units );

	//if( pdm_verbose)  printf( "sum data2 = %g,  sum psd2 = %g,  var = %g, T = %g, dt = %g\n", sumd2, sump2, var, xdif, xdif/n );;
}


void avvr( double data[], unsigned long n, double  *ave, double  *var )
{
    unsigned long j;
    double s, ep;

    for( *ave = 0.0, j = 1; j<= n; j++ )  *ave += data[j];
    *ave  /=  n;
    *var = ep = 0.0;
    for(j = 1; j <= n; j++ ) {
        s = data[j]-(*ave);
        ep +=  s;
        *var +=  s * s;
    }
    *var = (*var - ep * ep / n) / (n-1);
}


double dophase( double tt, double t0, double f )
{
    double t1, phase;
  
    if( tt < t0 ) {
        printf( "t < t0 in dophase\n" );
        getchar();
        do_exit(2);
    }
    t1  =  (tt - t0)  *  f;
    phase  =  t1 - (int)( t1 );;
    return( phase );
}